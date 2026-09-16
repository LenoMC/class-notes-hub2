import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { optionValidator, weekTypeValidator } from "./schema";
import type { Doc, Id } from "./_generated/dataModel";

// ---------- Rôles & helpers ----------

type UserDoc = Doc<"users">;

async function requireUser(ctx: any): Promise<UserDoc> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Non connecté");
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("Utilisateur introuvable");
  return user as UserDoc;
}

async function requireAdmin(ctx: any): Promise<UserDoc> {
  const user = await requireUser(ctx);
  if (!user.isAdmin) throw new Error("Réservé aux administrateurs du site");
  return user;
}

// ---------- Utilisateur courant ----------

export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const user = (await ctx.db.get(userId)) as UserDoc | null;
    if (!user) return null;
    const classroom = user.classId ? await ctx.db.get(user.classId) : null;
    return {
      _id: user._id,
      name: user.name,
      email: user.email,
      isAdmin: !!user.isAdmin,
      isClassAdmin: !!user.isClassAdmin,
      adminOfClassId: user.adminOfClassId ?? null,
      adminOfClassName: user.adminOfClassId
        ? (await ctx.db.get(user.adminOfClassId))?.name ?? null
        : null,
      classId: user.classId,
      className: classroom?.name ?? null,
      options: user.options ?? [],
      questionnaireDone: !!user.questionnaireDone,
    };
  },
});

// ---------- Questionnaire (classe + options) ----------

export const listClasses = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("classes").withIndex("by_name").collect();
    return rows.map((c) => ({ _id: c._id, name: c.name }));
  },
});

export const submitQuestionnaire = mutation({
  args: {
    classId: v.id("classes"),
    options: v.array(optionValidator),
  },
  handler: async (ctx, { classId, options }) => {
    const user = await requireUser(ctx);
    const classroom = await ctx.db.get(classId);
    if (!classroom) throw new Error("Classe introuvable");
    await ctx.db.patch(user._id, {
      classId,
      options,
      questionnaireDone: true,
    });
  },
});

// ---------- Gestion classes (admin global) ----------

export const createClass = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    await requireAdmin(ctx);
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Nom de classe requis");
    const existing = await ctx.db
      .query("classes")
      .withIndex("by_name", (q) => q.eq("name", trimmed))
      .first();
    if (existing) return existing._id;
    return ctx.db.insert("classes", { name: trimmed, createdAt: Date.now() });
  },
});

export const renameClass = mutation({
  args: { classId: v.id("classes"), name: v.string() },
  handler: async (ctx, { classId, name }) => {
    await requireAdmin(ctx);
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Nom de classe requis");
    await ctx.db.patch(classId, { name: trimmed });
  },
});

export const deleteClass = mutation({
  args: { classId: v.id("classes") },
  handler: async (ctx, { classId }) => {
    await requireAdmin(ctx);
    const slots = await ctx.db
      .query("timetableSlots")
      .withIndex("by_class", (q) => q.eq("classId", classId))
      .collect();
    for (const slot of slots) {
      const files = await ctx.db
        .query("courseFiles")
        .withIndex("by_slot", (q) => q.eq("slotId", slot._id))
        .collect();
      for (const f of files) {
        if (f.storageId) await ctx.storage.delete(f.storageId);
        await ctx.db.delete(f._id);
      }
      await ctx.db.delete(slot._id);
    }
    // Détache les utilisateurs de cette classe
    const users = await ctx.db.query("users").collect();
    for (const u of users) {
      if (u.classId === classId) {
        await ctx.db.patch(u._id, {
          classId: undefined,
          options: undefined,
          questionnaireDone: false,
        });
      }
      if (u.adminOfClassId === classId) {
        await ctx.db.patch(u._id, {
          adminOfClassId: undefined,
          isClassAdmin: false,
        });
      }
    }
    await ctx.db.delete(classId);
  },
});

// ---------- Emploi du temps ----------

function slotView(slot: Doc<"timetableSlots">) {
  return {
    _id: slot._id,
    day: slot.day,
    start: slot.start,
    end: slot.end,
    subject: slot.subject,
    teacher: slot.teacher,
    room: slot.room,
    weekType: slot.weekType ?? "AB",
    cancelled: !!slot.cancelled,
    cancellationReason: slot.cancellationReason,
  };
}

export const listSlots = query({
  args: { classId: v.id("classes"), week: v.optional(weekTypeValidator) },
  handler: async (ctx, { classId, week }) => {
    const rows = await ctx.db
      .query("timetableSlots")
      .withIndex("by_class", (q) => q.eq("classId", classId))
      .collect();
    const filtered = week
      ? rows.filter((s) => {
          const wt = s.weekType ?? "AB";
          return wt === "AB" || wt === week;
        })
      : rows;
    filtered.sort(
      (a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end),
    );
    return filtered.map(slotView);
  },
});

export const listMySlots = query({
  args: { week: v.optional(weekTypeValidator) },
  handler: async (ctx, { week }) => {
    const user = await requireUser(ctx);
    if (!user.classId) return [];
    const rows = await ctx.db
      .query("timetableSlots")
      .withIndex("by_class", (q) => q.eq("classId", user.classId!))
      .collect();
    const filtered = week
      ? rows.filter((s) => {
          const wt = s.weekType ?? "AB";
          return wt === "AB" || wt === week;
        })
      : rows;
    filtered.sort(
      (a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end),
    );
    return filtered.map(slotView);
  },
});

export const upsertSlot = mutation({
  args: {
    slotId: v.optional(v.id("timetableSlots")),
    classId: v.id("classes"),
    day: v.union(
      v.literal("Lundi"),
      v.literal("Mardi"),
      v.literal("Mercredi"),
      v.literal("Jeudi"),
      v.literal("Vendredi"),
      v.literal("Samedi"),
      v.literal("Dimanche"),
    ),
    start: v.string(),
    end: v.string(),
    subject: v.string(),
    teacher: v.optional(v.string()),
    room: v.optional(v.string()),
    weekType: v.optional(weekTypeValidator),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const targetClassId = args.slotId
      ? (await ctx.db.get(args.slotId))?.classId
      : args.classId;
    if (!targetClassId) throw new Error("Créneau introuvable");
    if (!user.isAdmin && !(user.isClassAdmin && user.classId === targetClassId)) {
      throw new Error("Réservé aux admins");
    }
    const { slotId, ...rest } = args;
    if (!rest.start || !rest.end || rest.end <= rest.start) {
      throw new Error("Horaires invalides");
    }
    if (slotId) {
      await ctx.db.patch(slotId, rest);
      return slotId;
    }
    return ctx.db.insert("timetableSlots", { ...rest, createdAt: Date.now() });
  },
});

// Annulation / rétablissement d'un cours (admin global ou responsable de classe)
export const setSlotCancelled = mutation({
  args: {
    slotId: v.id("timetableSlots"),
    cancelled: v.boolean(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, { slotId, cancelled, reason }) => {
    const user = await requireUser(ctx);
    const slot = await ctx.db.get(slotId);
    if (!slot) throw new Error("Créneau introuvable");
    if (!user.isAdmin && !(user.isClassAdmin && user.classId === slot.classId)) {
      throw new Error("Réservé aux admins");
    }
    await ctx.db.patch(slotId, {
      cancelled: cancelled || undefined,
      cancellationReason: cancelled ? reason?.trim() || undefined : undefined,
    });
  },
});

export const deleteSlot = mutation({
  args: { slotId: v.id("timetableSlots") },
  handler: async (ctx, { slotId }) => {
    const user = await requireUser(ctx);
    const slot = await ctx.db.get(slotId);
    if (!slot) throw new Error("Créneau introuvable");
    if (!user.isAdmin && !(user.isClassAdmin && user.classId === slot.classId)) {
      throw new Error("Réservé aux admins");
    }
    const files = await ctx.db
      .query("courseFiles")
      .withIndex("by_slot", (q) => q.eq("slotId", slotId))
      .collect();
    for (const f of files) {
      if (f.storageId) await ctx.storage.delete(f.storageId);
      await ctx.db.delete(f._id);
    }
    await ctx.db.delete(slotId);
  },
});

// ---------- Fichiers cours / devoirs ----------

export const listFilesForSlot = query({
  args: { slotId: v.id("timetableSlots") },
  handler: async (ctx, { slotId }) => {
    const rows = await ctx.db
      .query("courseFiles")
      .withIndex("by_slot", (q) => q.eq("slotId", slotId))
      .collect();
    rows.sort((a, b) => a.createdAt - b.createdAt);
    return rows.map((f) => ({
      _id: f._id,
      title: f.title,
      kind: f.kind,
      description: f.description ?? null,
      fileName: f.fileName,
      fileType: f.fileType,
      bytes: f.bytes ?? null,
      hasFile: !!f.storageId,
      storageId: f.storageId ?? null,
      externalUrl: f.externalUrl ?? null,
    }));
  },
});

export const addFileMeta = mutation({
  args: {
    slotId: v.id("timetableSlots"),
    title: v.string(),
    kind: v.union(v.literal("cours"), v.literal("devoir")),
    description: v.optional(v.string()),
    fileName: v.string(),
    fileType: v.string(),
    bytes: v.optional(v.number()),
    storageId: v.optional(v.id("_storage")),
    externalUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const slot = await ctx.db.get(args.slotId);
    if (!slot) throw new Error("Créneau introuvable");
    if (!user.isAdmin && !(user.isClassAdmin && user.classId === slot.classId)) {
      throw new Error("Seuls les admins peuvent ajouter des fichiers");
    }
    const { slotId, ...rest } = args;
    return ctx.db.insert("courseFiles", {
      slotId,
      ...rest,
      createdAt: Date.now(),
    });
  },
});

export const deleteFile = mutation({
  args: { fileId: v.id("courseFiles") },
  handler: async (ctx, { fileId }) => {
    const user = await requireUser(ctx);
    const file = await ctx.db.get(fileId);
    if (!file) throw new Error("Fichier introuvable");
    const slot = await ctx.db.get(file.slotId);
    if (!slot) throw new Error("Créneau introuvable");
    if (!user.isAdmin && !(user.isClassAdmin && user.classId === slot.classId)) {
      throw new Error("Réservé aux admins");
    }
    if (file.storageId) await ctx.storage.delete(file.storageId);
    await ctx.db.delete(fileId);
  },
});

export const getFileUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => ctx.storage.getUrl(storageId),
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

// ---------- Admins visibles (accueil) ----------

export const listAdmins = query({
  args: {},
  handler: async (ctx) => {
    const meUser = await requireUser(ctx);
    const users = await ctx.db.query("users").collect();
    const classes = await ctx.db.query("classes").collect();
    const classById = new Map(classes.map((c) => [c._id, c.name]));
    const mapUser = (u: UserDoc) => ({
      _id: u._id,
      name: u.name ?? null,
      email: u.email ?? null,
      className: u.classId ? classById.get(u.classId) ?? null : null,
    });
    const globals = users.filter((u) => u.isAdmin && !u.isAnonymous).map(mapUser);
    const classAdmins = users
      .filter(
        (u) =>
          u.isClassAdmin &&
          !u.isAnonymous &&
          // Un responsable est affiché pour sa classe désignée ou sa classe membre
          meUser.classId &&
          (u.adminOfClassId === meUser.classId || u.classId === meUser.classId),
      )
      .map(mapUser);
    return { globals, classAdmins };
  },
});

// ---------- Fichiers de la classe (avec infos créneau) ----------

export const listClassFiles = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    if (!user.classId) return [];
    const slots = await ctx.db
      .query("timetableSlots")
      .withIndex("by_class", (q) => q.eq("classId", user.classId!))
      .collect();
    const files = [] as Array<{
      _id: Id<"courseFiles">;
      title: string;
      kind: "cours" | "devoir";
      description: string | null;
      fileName: string;
      fileType: string;
      createdAt: number;
      hasFile: boolean;
      externalUrl: string | null;
      slotId: Id<"timetableSlots">;
      day: string;
      start: string;
      subject: string;
    }>;
    for (const slot of slots) {
      const slotFiles = await ctx.db
        .query("courseFiles")
        .withIndex("by_slot", (q) => q.eq("slotId", slot._id))
        .collect();
      for (const f of slotFiles) {
        files.push({
          _id: f._id,
          title: f.title,
          kind: f.kind,
          description: f.description ?? null,
          fileName: f.fileName,
          fileType: f.fileType,
          createdAt: f.createdAt,
          hasFile: !!f.storageId,
          externalUrl: f.externalUrl ?? null,
          slotId: slot._id,
          day: slot.day,
          start: slot.start,
          subject: slot.subject,
        });
      }
    }
    files.sort((a, b) => b.createdAt - a.createdAt);
    return files;
  },
});

// ---------- Gestion utilisateurs ----------

export const listUsers = query({
  args: {},
  handler: async (ctx) => {
    const meUser = await requireUser(ctx);
    if (!meUser.isAdmin) throw new Error("Réservé aux administrateurs");
    const users = await ctx.db.query("users").collect();
    const classes = await ctx.db.query("classes").collect();
    const classById = new Map(classes.map((c) => [c._id, c.name]));
    return users
      .filter((u) => !u.isAnonymous)
      .map((u) => ({
        _id: u._id,
        name: u.name ?? null,
        email: u.email ?? null,
        isAdmin: !!u.isAdmin,
        isClassAdmin: !!u.isClassAdmin,
        adminOfClassId: u.adminOfClassId ?? null,
        adminOfClassName: u.adminOfClassId
          ? classById.get(u.adminOfClassId) ?? null
          : null,
        classId: u.classId ?? null,
        className: u.classId ? classById.get(u.classId) ?? null : null,
        options: u.options ?? [],
        questionnaireDone: !!u.questionnaireDone,
      }));
  },
});

export const updateUser = mutation({
  args: {
    userId: v.id("users"),
    name: v.optional(v.string()),
    isAdmin: v.optional(v.boolean()),
    isClassAdmin: v.optional(v.boolean()),
    adminOfClassId: v.optional(v.union(v.id("classes"), v.null())),
    classId: v.optional(v.union(v.id("classes"), v.null())),
    options: v.optional(v.array(optionValidator)),
  },
  handler: async (ctx, { userId, ...patch }) => {
    const admin = await requireAdmin(ctx);
    const target = await ctx.db.get(userId);
    if (!target) throw new Error("Utilisateur introuvable");
    const update: Record<string, unknown> = {};
    if (patch.name !== undefined) update.name = patch.name;
    if (patch.isAdmin !== undefined) update.isAdmin = patch.isAdmin;
    if (patch.isClassAdmin !== undefined) update.isClassAdmin = patch.isClassAdmin;
    if (patch.adminOfClassId !== undefined) {
      update.adminOfClassId = patch.adminOfClassId ?? undefined;
    }
    if (patch.classId !== undefined) update.classId = patch.classId ?? undefined;
    if (patch.options !== undefined) update.options = patch.options;
    // Sécurité : impossible de retirer le dernier administrateur global
    if (
      userId === admin._id &&
      patch.isAdmin === false &&
      (await countAdmins(ctx)) <= 1
    ) {
      throw new Error("Impossible de retirer le dernier administrateur");
    }
    await ctx.db.patch(userId, update);
  },
});

async function countAdmins(ctx: any): Promise<number> {    const users = await ctx.db.query("users").collect();
  return users.filter((u: UserDoc) => u.isAdmin).length;
}

// ---------- Suppression complète d'un utilisateur ----------

export const deleteUser = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const admin = await requireAdmin(ctx);
    if (userId === admin._id) {
      throw new Error(
        "Vous ne pouvez pas supprimer votre propre compte depuis cette page.",
      );
    }
    const target = await ctx.db.get(userId);
    if (!target) throw new Error("Utilisateur introuvable");
    if (target.isAdmin && (await countAdmins(ctx)) <= 1) {
      throw new Error("Impossible de supprimer le dernier administrateur");
    }

    // 1) Sessions, tokens et codes de vérification liés au compte
    const sessions = await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .collect();
    for (const session of sessions) {
      const sessionTokens = await ctx.db
        .query("authRefreshTokens")
        .filter((q: any) => q.eq(q.field("sessionId"), session._id))
        .collect();
      for (const t of sessionTokens) await ctx.db.delete(t._id);
      const verifiers = await ctx.db
        .query("authVerifiers")
        .filter((q: any) => q.eq(q.field("sessionId"), session._id))
        .collect();
      for (const v2 of verifiers) await ctx.db.delete(v2._id);
      await ctx.db.delete(session._id);
    }

    // 2) Comptes d'authentification (email/mot de passe) et codes en attente
    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
      .collect();
    for (const account of accounts) {
      const codes = await ctx.db
        .query("authVerificationCodes")
        .withIndex("accountId", (q) => q.eq("accountId", account._id))
        .collect();
      for (const c of codes) await ctx.db.delete(c._id);
      await ctx.db.delete(account._id);
    }

    // 3) Limites de tentatives liées à ses emails
    for (const email of [target.email].filter(Boolean) as string[]) {
      const limits = await ctx.db
        .query("authRateLimits")
        .withIndex("identifier", (q) => q.eq("identifier", email))
        .collect();
      for (const l of limits) await ctx.db.delete(l._id);
    }

    // 4) Le document utilisateur lui-même
    await ctx.db.delete(userId);
    return true;
  },
});

// ---------- Bootstrap : le premier inscrit devient admin global ----------

export const claimAdminIfFirst = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const users = await ctx.db.query("users").collect();
    const realUsers = users.filter((u) => !u.isAnonymous);
    if (realUsers.some((u) => u.isAdmin)) return false;
    await ctx.db.patch(user._id, { isAdmin: true });
    return true;
  },
});
