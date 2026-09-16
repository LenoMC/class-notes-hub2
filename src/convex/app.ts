import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { OPTION_VALUES, optionValidator } from "./schema";
import type { Id } from "./_generated/dataModel";

// ---------- Rôles & helpers ----------

type UserDoc = {
  _id: Id<"users">;
  name?: string;
  email?: string;
  isAdmin?: boolean;
  isClassAdmin?: boolean;
  classId?: Id<"classes">;
  option?: "LCE" | "Latin" | "Allemand" | "Espagnol";
  questionnaireDone?: boolean;
};

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
      classId: user.classId,
      className: classroom?.name ?? null,
      option: user.option ?? null,
      questionnaireDone: !!user.questionnaireDone,
    };
  },
});

// ---------- Questionnaire (classe + option) ----------

export const listClasses = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("classes").withIndex("by_name").collect();
    return rows.map((c: any) => ({ _id: c._id, name: c.name }));
  },
});

export const submitQuestionnaire = mutation({
  args: {
    classId: v.id("classes"),
    option: v.union(optionValidator, v.null()),
  },
  handler: async (ctx, { classId, option }) => {
    const user = await requireUser(ctx);
    const classroom = await ctx.db.get(classId);
    if (!classroom) throw new Error("Classe introuvable");
    await ctx.db.patch(user._id, {
      classId,
      option: option ?? undefined,
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
      .withIndex("by_name", (q: any) => q.eq("name", trimmed))
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
      .withIndex("by_class", (q: any) => q.eq("classId", classId))
      .collect();
    for (const slot of slots) {
      const files = await ctx.db
        .query("courseFiles")
        .withIndex("by_slot", (q: any) => q.eq("slotId", slot._id))
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
      if ((u as any).classId === classId) {
        await ctx.db.patch(u._id, {
          classId: undefined,
          option: undefined,
          questionnaireDone: false,
        });
      }
    }
    await ctx.db.delete(classId);
  },
});

// ---------- Emploi du temps ----------

export const listSlots = query({
  args: { classId: v.id("classes") },
  handler: async (ctx, { classId }) => {
    const rows = await ctx.db
      .query("timetableSlots")
      .withIndex("by_class", (q: any) => q.eq("classId", classId))
      .collect();
    rows.sort((a: any, b: any) =>
      a.start.localeCompare(b.start) || a.end.localeCompare(b.end),
    );
    return rows;
  },
});

export const listMySlots = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    if (!user.classId) return [];
    const rows = await ctx.db
      .query("timetableSlots")
      .withIndex("by_class", (q: any) => q.eq("classId", user.classId!))
      .collect();
    rows.sort((a: any, b: any) =>
      a.start.localeCompare(b.start) || a.end.localeCompare(b.end),
    );
    return rows;
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

// Annulation / rétablissement d'un cours (admin global ou admin de la classe)
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
      ...(cancelled
        ? { cancellationReason: reason?.trim() || undefined }
        : { cancellationReason: undefined }),
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
      .withIndex("by_slot", (q: any) => q.eq("slotId", slotId))
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
      .withIndex("by_slot", (q: any) => q.eq("slotId", slotId))
      .collect();
    rows.sort((a: any, b: any) => a.createdAt - b.createdAt);
    return rows.map((f: any) => ({
      _id: f._id,
      title: f.title,
      kind: f.kind,
      description: f.description ?? null,
      fileName: f.fileName,
      fileType: f.fileType,
      bytes: f.bytes ?? null,
      externalUrl: f.externalUrl ?? null,
      hasFile: !!f.storageId,
      storageId: f.storageId ?? null,
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
    return ctx.db.insert("courseFiles", { slotId, ...rest, createdAt: Date.now() });
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

// ---------- Gestion utilisateurs ----------

export const listUsers = query({
  args: {},
  handler: async (ctx) => {
    const meUser = await requireUser(ctx);
    if (!meUser.isAdmin) throw new Error("Réservé aux administrateurs");
    const users = await ctx.db.query("users").collect();
    const classes = await ctx.db.query("classes").collect();
    const classById = new Map(classes.map((c: any) => [c._id, c.name]));
    return users
      .filter((u: any) => !u.isAnonymous)
      .map((u: any) => ({
        _id: u._id,
        name: u.name ?? null,
        email: u.email ?? null,
        isAdmin: !!u.isAdmin,
        isClassAdmin: !!u.isClassAdmin,
        classId: u.classId ?? null,
        className: u.classId ? classById.get(u.classId) ?? null : null,
        option: u.option ?? null,
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
    classId: v.optional(v.union(v.id("classes"), v.null())),
    option: v.optional(v.union(optionValidator, v.null())),
  },
  handler: async (ctx, { userId, ...patch }) => {
    const admin = await requireAdmin(ctx);
    const target = await ctx.db.get(userId);
    if (!target) throw new Error("Utilisateur introuvable");
    const update: Record<string, unknown> = {};
    if (patch.name !== undefined) update.name = patch.name;
    if (patch.isAdmin !== undefined) update.isAdmin = patch.isAdmin;
    if (patch.isClassAdmin !== undefined) update.isClassAdmin = patch.isClassAdmin;
    if (patch.classId !== undefined) update.classId = patch.classId ?? undefined;
    if (patch.option !== undefined) update.option = patch.option ?? undefined;
    // On ne peut pas se retirer soi-même les droits admin global (dernier admin)
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

async function countAdmins(ctx: any): Promise<number> {
  const users = await ctx.db.query("users").collect();
  return users.filter((u: any) => u.isAdmin).length;
}

// ---------- Admins visibles (accueil) ----------

export const listAdmins = query({
  args: {},
  handler: async (ctx) => {
    const meUser = await requireUser(ctx);
    const users = await ctx.db.query("users").collect();
    const classes = await ctx.db.query("classes").collect();
    const classById = new Map(classes.map((c: any) => [c._id, c.name]));
    const mapUser = (u: any) => ({
      _id: u._id,
      name: u.name ?? null,
      email: u.email ?? null,
      className: u.classId ? classById.get(u.classId) ?? null : null,
    });
    const globals = users.filter((u: any) => u.isAdmin && !u.isAnonymous).map(mapUser);
    const classAdmins = users
      .filter(
        (u: any) =>
          u.isClassAdmin &&
          !u.isAnonymous &&
          meUser.classId &&
          u.classId === meUser.classId,
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
      .withIndex("by_class", (q: any) => q.eq("classId", user.classId!))
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
        .withIndex("by_slot", (q: any) => q.eq("slotId", slot._id))
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

// ---------- Bootstrap : le premier inscrit devient admin global ----------

export const claimAdminIfFirst = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const users = await ctx.db.query("users").collect();
    const realUsers = users.filter((u: any) => !u.isAnonymous);
    if (realUsers.some((u: any) => u.isAdmin)) return false;
    await ctx.db.patch(user._id, { isAdmin: true });
    return true;
  },
});

// ---------- Option ----------

export const OPTION_LIST = OPTION_VALUES;
