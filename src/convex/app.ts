import axios from "axios";
import { ConvexError } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { action, mutation, query } from "./_generated/server";
import { internalMutation } from "./_generated/server";
import { api } from "./_generated/api";
import { optionValidator, weekTypeValidator } from "./schema";
import { optionRuleError, canSpanPeriods, subjectRequiresOption } from "../lib/subjects";
import { PERIODS } from "../lib/periods";
import {
  computeWeekState,
  todayDayString,
  WEEK_ANCHOR_DEFAULT,
} from "../lib/weeks";
import type { Doc, Id } from "./_generated/dataModel";

// ---------- Rôles & helpers ----------

type UserDoc = Doc<"users">;

async function requireUser(ctx: any): Promise<UserDoc> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Non connecté");
  const user = await ctx.db.get(userId);
  if (!user) {
    // Session orpheline (compte supprimé / DB réinitialisée) : erreur claire
    // que le client intercepte pour déconnecter proprement.
    throw new ConvexError("SESSION_EXPIREE");
  }
  return user as UserDoc;
}

async function requireAdmin(ctx: any): Promise<UserDoc> {
  const user = await requireUser(ctx);
  if (!user.isAdmin) throw new Error("Réservé aux administrateurs du site");
  return user;
}

function validOptionsOrThrow(options: Array<string>): OptionValue[] {
  const err = optionRuleError(options);
  if (err) throw new Error(err);
  return options as OptionValue[];
}

type OptionValue = Doc<"users">["options"] extends Array<infer T> ? T : never;

// ---------- Utilisateur courant ----------

export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const user = (await ctx.db.get(userId)) as UserDoc | null;
    if (!user) return null; // session orpheline (compte supprimé) → traité comme déconnecté
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
      group: user.group ?? null,
      questionnaireDone: !!user.questionnaireDone,
      phone: user.phone ?? null,
      discordId: user.discordId ?? null,
    };
  },
});

// ---------- Approbation d'accès (preuve Arsene76) ----------

/** État de la demande d'accès de l'utilisateur courant. */
export const myAccessRequest = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const row = await ctx.db
      .query("accessRequests")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .first();
    if (!row) return null;
    return {
      _id: row._id,
      status: row.status,
      storageId: row.storageId,
      reviewNote: row.reviewNote ?? null,
      createdAt: row.createdAt,
      reviewedAt: row.reviewedAt ?? null,
    };
  },
});

/** Liste des demandes (admin global) — optionnellement filtrées par statut. */
export const listAccessRequests = query({
  args: { status: v.optional(v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected"))) },
  handler: async (ctx, { status }) => {
    await requireAdmin(ctx);
    const rows = status
      ? await ctx.db
          .query("accessRequests")
          .withIndex("by_status", (q) => q.eq("status", status))
          .collect()
      : await ctx.db.query("accessRequests").collect();
    rows.sort((a, b) => b.createdAt - a.createdAt);
    return rows.map((r) => ({
      _id: r._id,
      userId: r.userId,
      userEmail: r.userEmail,
      userName: r.userName ?? null,
      storageId: r.storageId,
      status: r.status,
      reviewNote: r.reviewNote ?? null,
      createdAt: r.createdAt,
      reviewedAt: r.reviewedAt ?? null,
    }));
  },
});

/** Soumission d'une demande d'accès avec capture d'écran de preuve.
    Notifie tous les administrateurs globaux par email. */
export const submitAccessRequest = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    const user = await requireUser(ctx);
    if (!user.email) throw new Error("Email manquant sur le compte.");
    // Vérifie que le fichier existe bien dans le stockage
    const meta = await ctx.db.system.get(storageId);
    if (!meta) throw new Error("Fichier introuvable. Rechargez la page.");
    const existing = await ctx.db
      .query("accessRequests")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .first();
    if (existing && existing.status === "pending") {
      throw new Error("Une demande est déjà en cours d'examen.");
    }
    if (existing && existing.status === "approved") {
      throw new Error("Votre accès est déjà approuvé.");
    }
    await ctx.db.insert("accessRequests", {
      userId: user._id,
      userEmail: user.email,
      userName: user.name ?? undefined,
      storageId,
      status: "pending",
      createdAt: Date.now(),
    });
    // Notification email + SMS + MP Discord aux administrateurs globaux
    const admins = (await ctx.db.query("users").collect()).filter(
      (u) => u.isAdmin && u.email,
    );
    const adminEmails = admins.map((a) => a.email!);
    const adminPhones = admins
      .map((a) => a.phone)
      .filter((p): p is string => !!p);
    const adminDiscordIds = admins
      .map((a) => a.discordId)
      .filter((d): d is string => !!d);
    if (adminEmails.length > 0) {
      await ctx.scheduler.runAfter(0, api.app.sendApprovalEmails, {
        to: adminEmails,
        userName: user.name ?? user.email,
        userEmail: user.email,
      });
    }
    if (adminPhones.length > 0) {
      await ctx.scheduler.runAfter(0, api.app.sendApprovalSms, {
        phones: adminPhones,
        userName: user.name ?? user.email,
        userEmail: user.email,
      });
    }
    if (adminDiscordIds.length > 0) {
      await ctx.scheduler.runAfter(0, api.app.sendApprovalDiscordDm, {
        discordIds: adminDiscordIds,
        userName: user.name ?? user.email,
        userEmail: user.email,
      });
    }
    return true;
  },
});

/** Envoi des emails de notification aux admins (action Node). */
export const sendApprovalEmails = action({
  args: {
    to: v.array(v.string()),
    userName: v.string(),
    userEmail: v.string(),
  },
  handler: async (ctx, { to, userName, userEmail }) => {
    if (to.length === 0) return;
    // URL publique du SITE (pas du backend Convex !). À définir via
    // `bunx convex env set PUBLIC_SITE_URL https://votre-site.fr`.
    const siteUrl = process.env.PUBLIC_SITE_URL || "";
    const subject = `Recoursy — nouvelle demande d'accès à approuver (${userName})`;
    // Email HTML propre via Resend (RESEND_API_KEY). Fallback : console.
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.warn(
        "[approbations] RESEND_API_KEY manquante : email non envoyé.",
      );
      return;
    }
    const html = `
      <div style="font-family:'Segoe UI',Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;background:#0b1020;color:#e6e9f5;border-radius:12px;overflow:hidden;border:1px solid #232a45">
        <div style="padding:20px 24px;background:#101735;border-bottom:1px solid #232a45">
          <h1 style="margin:0;font-size:18px;color:#8fa5ff">Recoursy — Nouvelle demande d'accès</h1>
        </div>
        <div style="padding:24px">
          <p style="margin:0 0 12px;font-size:14px;line-height:1.6">
            <strong>${userName}</strong> (${userEmail}) a soumis une capture d'écran
            de preuve (Arsene76) et attend votre approbation.
          </p>
          ${
            siteUrl
              ? `<p style="margin:0 0 20px;font-size:14px">Ouvrez l'administration du site pour examiner la preuve :</p>
          <a href="${siteUrl}/admin" style="display:inline-block;background:#4c6ef5;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold;font-size:14px">Examiner la demande</a>`
              : `<p style="margin:0 0 8px;font-size:14px">Ouvrez l'administration du site (onglet « Approbations ») pour examiner la preuve.</p>`
          }
          <p style="margin:20px 0 0;font-size:12px;color:#8b93b8">
            Vous recevez cet email car vous êtes administrateur global de Recoursy.
          </p>
        </div>
      </div>`;
    try {
      await axios.post(
        "https://api.resend.com/emails",
        {
          from: "Recoursy <onboarding@resend.dev>",
          to,
          subject,
          html,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
        },
      );
    } catch (err) {
      console.warn("[approbations] échec envoi Resend :", err);
    }
  },
});

/** Envoi d'un SMS à chaque admin qui a enregistré un numéro (textbee).
    Gratuit : 300 SMS/mois via votre propre téléphone Android + SIM.
    Nécessite TEXTBEE_API_KEY et TEXTBEE_DEVICE_ID (textbee.dev). */
export const sendApprovalSms = action({
  args: {
    phones: v.array(v.string()),
    userName: v.string(),
    userEmail: v.string(),
  },
  handler: async (ctx, { phones, userName, userEmail }) => {
    const apiKey = process.env.TEXTBEE_API_KEY;
    const deviceId = process.env.TEXTBEE_DEVICE_ID;
    if (!apiKey || !deviceId || phones.length === 0) {
      console.warn("[SMS] textbee non configuré — SMS ignorés.");
      return;
    }
    const siteUrl = process.env.PUBLIC_SITE_URL || "";
    const text = `Recoursy : ${userName} (${userEmail}) attend l'approbation de sa preuve Arsene76.${siteUrl ? ` ${siteUrl}/admin` : ""}`;
    for (const phone of phones) {
      try {
        await axios.post(
          `https://api.textbee.dev/api/v1/gateway/devices/${deviceId}/send-sms`,
          {
            recipients: [phone],
            message: text,
          },
          {
            headers: {
              "x-api-key": apiKey,
              "Content-Type": "application/json",
            },
          },
        );
      } catch (err) {
        console.warn("[SMS] échec vers", phone, err);
      }
    }
  },
});

/** Envoi d'un MP Discord à chaque admin qui a lié son compte (bot Discord).
    Nécessite DISCORD_BOT_TOKEN et que l'admin partage un serveur avec le bot. */
export const sendApprovalDiscordDm = action({
  args: {
    discordIds: v.array(v.string()),
    userName: v.string(),
    userEmail: v.string(),
  },
  handler: async (ctx, { discordIds, userName, userEmail }) => {
    const token = process.env.DISCORD_BOT_TOKEN;
    if (!token || discordIds.length === 0) {
      console.warn("[Discord] bot non configuré — MPs ignorés.");
      return;
    }
    const siteUrl = process.env.PUBLIC_SITE_URL || "";
    const content = `**Recoursy — nouvelle demande d'accès**\n${userName} (${userEmail}) a envoyé sa preuve Arsene76 et attend votre approbation.${siteUrl ? `\n<${siteUrl}/admin>` : ""}`;
    const headers = {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    };
    for (const discordId of discordIds) {
      try {
        // 1) Ouvre un canal de MP avec l'utilisateur
        const channelRes = await axios.post(
          "https://discord.com/api/v10/users/@me/channels",
          { recipient_id: discordId },
          { headers },
        );
        const channelId = channelRes.data?.id as string | undefined;
        if (!channelId) continue;
        // 2) Envoie le message dans ce canal
        await axios.post(
          `https://discord.com/api/v10/channels/${channelId}/messages`,
          { content },
          { headers },
        );
      } catch (err) {
        console.warn("[Discord] échec MP vers", discordId, err);
      }
    }
  },
});

/** Approbation ou refus d'une demande (admin global). */
export const reviewAccessRequest = mutation({
  args: {
    requestId: v.id("accessRequests"),
    approve: v.boolean(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { requestId, approve, note }) => {
    const admin = await requireAdmin(ctx);
    const row = await ctx.db.get(requestId);
    if (!row) throw new Error("Demande introuvable.");
    if (row.status !== "pending") {
      throw new Error("Cette demande a déjà été traitée.");
    }
    await ctx.db.patch(requestId, {
      status: approve ? "approved" : "rejected",
      reviewerId: admin._id,
      reviewNote: note?.trim() || undefined,
      reviewedAt: Date.now(),
    });
  },
});

/** URL d'une capture de preuve (lecture réservée aux admins et au propriétaire). */
export const getAccessImageUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => ctx.storage.getUrl(storageId),
});

/** Réinitialise une demande refusée pour permettre une nouvelle soumission. */
export const deleteMyAccessRequest = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("accessRequests")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    for (const r of rows) {
      if (r.status !== "approved") {
        if (r.storageId) await ctx.storage.delete(r.storageId);
        await ctx.db.delete(r._id);
      }
    }
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
    options: v.array(v.string()),
    group: v.optional(v.union(v.literal("G1"), v.literal("G2"))),
  },
  handler: async (ctx, { classId, options, group }) => {
    const user = await requireUser(ctx);
    const classroom = await ctx.db.get(classId);
    if (!classroom) throw new Error("Classe introuvable");
    const validated = validOptionsOrThrow(options);
    await ctx.db.patch(user._id, {
      classId,
      options: validated,
      ...(group ? { group } : {}),
      questionnaireDone: true,
    });
  },
});

// ---------- Profil : modification de ses informations ----------

export const updateProfile = mutation({
  args: {
    name: v.optional(v.string()),
    classId: v.optional(v.union(v.id("classes"), v.null())),
    options: v.optional(v.array(v.string())),
    group: v.optional(v.union(v.literal("G1"), v.literal("G2"), v.null())),
    phone: v.optional(v.union(v.string(), v.null())),
    discordId: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, { name, classId, options, group, phone, discordId }) => {
    const user = await requireUser(ctx);
    const update: Record<string, unknown> = {};
    if (name !== undefined) update.name = name.trim() || undefined;
    if (classId !== undefined) update.classId = classId ?? undefined;
    if (options !== undefined) {
      update.options = validOptionsOrThrow(options);
      update.questionnaireDone = true;
    }
    if (group !== undefined) update.group = group ?? undefined;
    // Notifications admins : téléphone E.164 et ID Discord (chiffres only)
    if (phone !== undefined) {
      const p = phone?.trim() || "";
      if (p && !/^\+\d{8,15}$/.test(p)) {
        throw new Error(
          "Numéro invalide : format international attendu, ex. +33612345678.",
        );
      }
      update.phone = p || undefined;
    }
    if (discordId !== undefined) {
      const d = discordId?.trim() || "";
      if (d && !/^\d{15,21}$/.test(d)) {
        throw new Error("Identifiant Discord invalide (17 à 20 chiffres).");
      }
      update.discordId = d || undefined;
    }
    await ctx.db.patch(user._id, update);
  },
});

// ---------- Modification d'email ----------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function changeEmail(ctx: any, user: UserDoc, newEmailRaw: string) {
  const newEmail = newEmailRaw.trim().toLowerCase();
  if (!EMAIL_RE.test(newEmail)) {
    throw new Error("Adresse email invalide.");
  }
  if (user.email && newEmail === user.email.toLowerCase()) return;
  const taken = await ctx.db
    .query("authAccounts")
    .withIndex("providerAndAccountId", (q: any) =>
      q.eq("provider", "password").eq("providerAccountId", newEmail),
    )
    .first();
  if (taken) {
    throw new Error("Cet email est déjà utilisé par un autre compte.");
  }
  // Met à jour le compte d'authentification (identifiant de connexion)
  const accounts = await ctx.db
    .query("authAccounts")
    .withIndex("userIdAndProvider", (q: any) =>
      q.eq("userId", user._id).eq("provider", "password"),
    )
    .collect();
  for (const a of accounts) {
    await ctx.db.patch(a._id, { providerAccountId: newEmail });
  }
  await ctx.db.patch(user._id, { email: newEmail });
}

/** L'utilisateur change sa propre adresse email. */
export const updateMyEmail = mutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const user = await requireUser(ctx);
    await changeEmail(ctx, user, email);
  },
});

/** Un administrateur global change l'email d'un utilisateur. */
export const adminUpdateUserEmail = mutation({
  args: { userId: v.id("users"), email: v.string() },
  handler: async (ctx, { userId, email }) => {
    await requireAdmin(ctx);
    const target = await ctx.db.get(userId);
    if (!target) throw new Error("Utilisateur introuvable");
    await changeEmail(ctx, target as UserDoc, email);
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

// ---------- Vacances & alternance A/B ----------

// Règle établie avec l'utilisateur : la semaine du 14 septembre 2026 est une
// semaine A (celle du 21 au 25 est une semaine B, et ainsi de suite).
const ANCHOR_DEFAULT = WEEK_ANCHOR_DEFAULT;

function getAnchorRaw(anchor: Doc<"weekAnchor"> | null): string | null {
  return anchor?.startDay ?? null;
}

/** État de l'alternance A/B : semaine actuelle + vacances en cours. */
export const weekState = query({
  args: {},
  handler: async (ctx) => {
    const today = todayDayString();
    const anchor = await ctx.db.query("weekAnchor").first();
    const holidays = await ctx.db.query("holidays").collect();
    return computeWeekState(
      today,
      getAnchorRaw(anchor),
      holidays.map((h) => ({ label: h.label, startDay: h.startDay, endDay: h.endDay })),
    );
  },
});

// ---------- Gestion des vacances & ancre (admin global) ----------

export const listHolidays = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const rows = await ctx.db.query("holidays").collect();
    rows.sort((a, b) => a.startDay.localeCompare(b.startDay));
    return rows.map((h) => ({
      _id: h._id,
      label: h.label,
      startDay: h.startDay,
      endDay: h.endDay,
    }));
  },
});

export const addHoliday = mutation({
  args: { label: v.string(), startDay: v.string(), endDay: v.string() },
  handler: async (ctx, { label, startDay, endDay }) => {
    await requireAdmin(ctx);
    if (!startDay || !endDay || endDay < startDay) {
      throw new Error("Dates invalides");
    }
    await ctx.db.insert("holidays", {
      label: label.trim() || "Vacances",
      startDay,
      endDay,
      createdAt: Date.now(),
    });
  },
});

export const deleteHoliday = mutation({
  args: { holidayId: v.id("holidays") },
  handler: async (ctx, { holidayId }) => {
    await requireAdmin(ctx);
    await ctx.db.delete(holidayId);
  },
});

export const getWeekAnchor = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const anchor = await ctx.db.query("weekAnchor").first();
    return { startDay: getAnchorRaw(anchor) ?? ANCHOR_DEFAULT };
  },
});

export const setWeekAnchor = mutation({
  args: { startDay: v.string() },
  handler: async (ctx, { startDay }) => {
    await requireAdmin(ctx);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDay)) {
      throw new Error("Date invalide");
    }
    const existing = await ctx.db.query("weekAnchor").first();
    if (existing) {
      await ctx.db.patch(existing._id, { startDay });
    } else {
      await ctx.db.insert("weekAnchor", { startDay });
    }
  },
});

// ---------- Emploi du temps ----------

const DEBUT_MIN = "08:15"; // les cours commencent au plus tôt à 8h15
const FIN_MAX = "16:45"; // fin de journée (lun, mar, jeu, ven)
const MERCREDI_LIMITE = "12:10"; // le mercredi, fin au plus tard à 12h10
const WEEKEND_DAYS = ["Samedi", "Dimanche"];

function validateSlot(
  user: UserDoc,
  targetClassId: Id<"classes">,
  day: string,
  start: string,
  end: string,
  subject: string,
  color?: string,
) {
  if (!user.isAdmin && !(user.isClassAdmin && user.classId === targetClassId)) {
    throw new Error("Réservé aux admins");
  }
  if (!start || !end || end <= start) {
    throw new Error("Horaires invalides");
  }
  if (WEEKEND_DAYS.includes(day)) {
    throw new Error("Il n'y a pas cours le week-end.");
  }
  if (start < DEBUT_MIN) {
    throw new Error("Les cours commencent au plus tôt à 08:15.");
  }
  const finMax = day === "Mercredi" ? MERCREDI_LIMITE : FIN_MAX;
  if (end > finMax) {
    throw new Error(
      day === "Mercredi"
        ? "Le mercredi, les cours s'arrêtent au plus tard à 12:10."
        : "Les cours s'arrêtent au plus tard à 16:45.",
    );
  }
  if (!subject.trim()) {
    throw new Error("Matière requise");
  }
  if (color !== undefined && color !== "" && !/^#[0-9a-fA-F]{6}$/.test(color)) {
    throw new Error("Couleur invalide.");
  }
}

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
    group: slot.group ?? null,
    color: slot.color,
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

// ---------- Chat de classe ----------

/** Messages du chat de la classe de l'utilisateur (temps réel via Convex). */
export const listChatMessages = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const user = await requireUser(ctx);
    if (!user.classId) return [];
    const rows = await ctx.db
      .query("chatMessages")
      .withIndex("by_class", (q) => q.eq("classId", user.classId!))
      .order("desc")
      .take(limit ?? 200);
    // Enrichit les messages avec les fiches jointes (titre + type de pièce)
    const enriched = [] as Array<{
      _id: Id<"chatMessages">;
      text: string;
      createdAt: number;
      authorId: Id<"users">;
      mine: boolean;
      fiche: null | {
        _id: Id<"courseFiles">;
        title: string;
        kind: "cours" | "devoir";
        hasFile: boolean;
        storageId: Id<"_storage"> | null;
        externalUrl: string | null;
      };
    }>;
    for (const m of rows.reverse()) {
      let fiche: (typeof enriched)[number]["fiche"] = null;
      if (m.ficheId) {
        const f = await ctx.db.get(m.ficheId);
        if (f) {
          fiche = {
            _id: f._id,
            title: f.title,
            kind: f.kind,
            hasFile: !!f.storageId,
            storageId: f.storageId ?? null,
            externalUrl: f.externalUrl ?? null,
          };
        }
      }
      enriched.push({
        _id: m._id,
        text: m.text,
        createdAt: m.createdAt,
        authorId: m.authorId,
        mine: m.authorId === user._id,
        fiche,
      });
    }
    return enriched;
  },
});

/** Envoi d'un message dans le chat de sa classe (ou classe désignée pour un
 *  admin global sans classe). Une fiche de la classe peut être jointe. */
export const sendChatMessage = mutation({
  args: {
    text: v.string(),
    ficheId: v.optional(v.id("courseFiles")),
  },
  handler: async (ctx, { text, ficheId }) => {
    const user = await requireUser(ctx);
    const trimmed = text.trim();
    if (!trimmed && !ficheId) throw new Error("Message vide.");
    if (trimmed.length > 1000) {
      throw new Error("Message trop long (1000 caractères maximum).");
    }
    const classId = user.classId ?? user.adminOfClassId ?? null;
    if (!classId) {
      throw new Error(
        "Rejoignez d'abord une classe (questionnaire d'accueil) pour discuter.",
      );
    }
    // La fiche jointe doit appartenir à un créneau de la même classe.
    if (ficheId) {
      const fiche = await ctx.db.get(ficheId);
      if (!fiche) throw new Error("Fiche introuvable.");
      const slot = await ctx.db.get(fiche.slotId);
      if (!slot || slot.classId !== classId) {
        throw new Error("Cette fiche n'appartient pas à votre classe.");
      }
    }
    await ctx.db.insert("chatMessages", {
      classId,
      authorId: user._id,
      text: trimmed,
      ...(ficheId ? { ficheId } : {}),
      createdAt: Date.now(),
    });
  },
});

/** Suppression de son propre message (ou par un admin global). */
export const deleteChatMessage = mutation({
  args: { messageId: v.id("chatMessages") },
  handler: async (ctx, { messageId }) => {
    const user = await requireUser(ctx);
    const message = await ctx.db.get(messageId);
    if (!message) throw new Error("Message introuvable.");
    if (message.authorId !== user._id && !user.isAdmin) {
      throw new Error("Vous ne pouvez supprimer que vos propres messages.");
    }
    await ctx.db.delete(messageId);
  },
});

/** Membres de la classe (affichés à côté du chat). */
export const listChatMembers = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const classId = me.isAdmin
      ? me.adminOfClassId ?? me.classId ?? null
      : me.classId ?? null;
    if (!classId) return [];
    const members = await ctx.db
      .query("users")
      .withIndex("by_class", (q) => q.eq("classId", classId))
      .collect();
    return members
      .filter((u) => !u.isAnonymous)
      .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
      .map((u) => ({
        _id: u._id,
        name: u.name ?? null,
        email: u.email ?? null,
        isMe: u._id === me._id,
      }));
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
    const filtered = rows.filter((s) => {
      const wt = s.weekType ?? "AB";
      if (week && wt !== "AB" && wt !== week) return false;
      // Les matières option ne concernent que les élèves qui l'ont choisie
      // (les administrateurs globaux voient toutes les options).
      const opt = subjectRequiresOption(s.subject);
      const myOptions: string[] = user.options ?? [];
      if (opt && !user.isAdmin && !myOptions.includes(opt)) {
        return false;
      }
      // Vendredi : si un groupe est assigné, seuls ses créneaux s'affichent
      if (s.group && user.group && s.group !== user.group) return false;
      return true;
    });
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
    ),
    start: v.string(),
    end: v.string(),
    subject: v.string(),
    teacher: v.optional(v.string()),
    room: v.optional(v.string()),
    weekType: v.optional(weekTypeValidator),
    group: v.optional(v.union(v.literal("G1"), v.literal("G2"))), // créneau réservé à un groupe
    color: v.optional(v.string()), // hex #RRGGBB, sinon couleur de la matière
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const targetClassId = args.slotId
      ? (await ctx.db.get(args.slotId))?.classId
      : args.classId;
    if (!targetClassId) throw new Error("Créneau introuvable");
    validateSlot(
      user,
      targetClassId,
      args.day,
      args.start,
      args.end,
      args.subject,
      args.color,
    );
    // Un cours occupe normalement UN seul créneau fixe. Seuls l'EPS et la
    // Sécurité Civile peuvent chevaucher plusieurs créneaux (ex. 10h20 →
    // 12h10) — le début ET la fin doivent correspondre à des créneaux fixes.
    const startsAtPeriod = PERIODS.some((p) => p.start === args.start);
    const endsAtPeriod = PERIODS.some((p) => p.end === args.end);
    if (!startsAtPeriod || !endsAtPeriod) {
      throw new Error(
        "Les horaires doivent correspondre aux créneaux fixes de la journée.",
      );
    }
    const singlePeriod = PERIODS.some(
      (p) => p.start === args.start && p.end === args.end,
    );
    if (!singlePeriod && !canSpanPeriods(args.subject)) {
      throw new Error(
        "Seuls l'EPS et la Sécurité Civile peuvent occuper plusieurs créneaux d'affilée.",
      );
    }
    const { slotId, ...rest } = args;
    if (!rest.color) delete rest.color;
    if (!rest.group) delete rest.group;
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
    // Les responsables de classe peuvent modifier mais pas supprimer.
    if (!user.isAdmin) {
      throw new Error(
        "Seuls les administrateurs globaux peuvent supprimer un cours.",
      );
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
    // EPS : aucune publication de devoirs/fichiers
    if (isEps(slot.subject) && args.kind === "devoir") {
      throw new Error("Aucun devoir n'est publié pour l'EPS.");
    }
    const { slotId, ...rest } = args;
    return ctx.db.insert("courseFiles", {
      slotId,
      ...rest,
      createdAt: Date.now(),
    });
  },
});

function isEps(subject: string): boolean {
  const n = subject
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (/chimie/.test(n)) return false;
  return /(\beps\b|ed\s*\.?\s*physique|\bsport\b)/.test(n);
}

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
          meUser.classId &&
          (u.adminOfClassId === meUser.classId || u.classId === meUser.classId),
      )
      .map(mapUser);
    return { globals, classAdmins };
  },
});

// ---------- Fichiers de la classe (avec infos créneau) ----------

export const listClassFiles = query({
  args: { kind: v.optional(v.union(v.literal("cours"), v.literal("devoir"))) },
  handler: async (ctx, { kind }) => {
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
      storageId: Id<"_storage"> | null;
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
        if (kind && f.kind !== kind) continue;
        files.push({
          _id: f._id,
          title: f.title,
          kind: f.kind,
          description: f.description ?? null,
          fileName: f.fileName,
          fileType: f.fileType,
      createdAt: f.createdAt,
      hasFile: !!f.storageId,
      storageId: f.storageId ?? null,
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
        group: u.group ?? null,
        questionnaireDone: !!u.questionnaireDone,
      }));
  },
});

/** Membres de la classe du responsable (ou de la classe désignée pour un
 *  admin global) — sert à la gestion des Groupes 1/2 du vendredi. */
export const listMyClassMembers = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const classId = me.isAdmin
      ? me.adminOfClassId ?? me.classId ?? null
      : me.classId ?? null;
    if (!classId) return [];
    if (!me.isAdmin && !me.isClassAdmin) {
      throw new Error("Réservé aux responsables de classe");
    }
    const members = await ctx.db
      .query("users")
      .withIndex("by_class", (q) => q.eq("classId", classId))
      .collect();
    return members
      .filter((u) => !u.isAnonymous)
      .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
      .map((u) => ({
        _id: u._id,
        name: u.name ?? null,
        email: u.email ?? null,
        group: u.group ?? null,
      }));
  },
});

/** Attribution d'un élève au Groupe 1 ou Groupe 2 (vendredi) — réservé au
 *  responsable de sa classe et aux administrateurs globaux. */
export const setUserGroup = mutation({
  args: {
    userId: v.id("users"),
    group: v.union(v.literal("G1"), v.literal("G2"), v.null()),
  },
  handler: async (ctx, { userId, group }) => {
    const me = await requireUser(ctx);
    const target = await ctx.db.get(userId);
    if (!target) throw new Error("Utilisateur introuvable");
    if (me.isAdmin) {
      // un admin global ne gère les groupes que de sa classe désignée ou la sienne
      const scope = me.adminOfClassId ?? me.classId ?? null;
      if (scope && target.classId !== scope) {
        throw new Error(
          "Vous ne pouvez gérer les groupes que de votre classe (resp. désignée).",
        );
      }
    } else if (
      !me.isClassAdmin ||
      !me.classId ||
      target.classId !== me.classId
    ) {
      throw new Error("Réservé au responsable de la classe de cet élève.");
    }
    await ctx.db.patch(userId, { group: group ?? undefined });
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
    options: v.optional(v.array(v.string())),
    group: v.optional(v.union(v.literal("G1"), v.literal("G2"), v.null())),
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
    if (patch.group !== undefined) update.group = patch.group ?? undefined;
    if (patch.options !== undefined) {
      update.options = validOptionsOrThrow(patch.options);
      update.questionnaireDone = true;
    }
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

async function countAdmins(ctx: any): Promise<number> {
  const users = await ctx.db.query("users").collect();
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

/** [OUTIL DEV] Purge complète de la base : toutes les tables + stockage.
    S'exécute via : bunx convex run app:wipeAllDatabase
    (aucune vérif d'auth : usage ponctuel de maintenance uniquement) */
export const wipeAllDatabase = mutation({
  args: {},
  handler: async (ctx) => {
    const tables = [
      "chatMessages",
      "accessRequests",
      "courseFiles",
      "timetableSlots",
      "holidays",
      "weekAnchor",
      "classes",
      "users",
    ] as const;
    const counts: Record<string, number> = {};
    for (const t of tables) {
      const rows = await ctx.db.query(t).collect();
      for (const r of rows) {
        await ctx.db.delete(r._id);
      }
      counts[t] = rows.length;
    }
    // Fichiers du stockage (captures de preuve, fiches uploadées)
    const storageDocs = await ctx.db.system.query("_storage").collect();
    for (const s of storageDocs) {
      await ctx.storage.delete(s._id);
    }
    counts._storage = storageDocs.length;
    return counts;
  },
});

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
