// Fonctions "normales" (runtime Convex) : stockage des connexions + mise à jour des cours.
import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

// true = le nom de la matière du créneau est aussi remplacé par celui de Pronote.
// Attention : si ton site filtre par option avec le nom de la matière, laisse false.
const RENAME_SUBJECTS = false;

const DAYS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"] as const;

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// Deux textes sont "pareils" si l'un contient l'autre, ou si l'un est absent.
const same = (a?: string, b?: string) => {
  if (!a || !b) return true;
  const x = norm(a), y = norm(b);
  if (!x || !y) return true;
  return x.includes(y) || y.includes(x);
};

// Hypothèse : weekAnchor.startDay = un lundi d'une semaine "A" (format YYYY-MM-DD).
function weekTypeOf(date: string, anchor: string): "A" | "B" {
  const diff = Date.parse(date + "T00:00:00Z") - Date.parse(anchor + "T00:00:00Z");
  const weeks = Math.floor(diff / (7 * 86400000));
  return ((weeks % 2) + 2) % 2 === 0 ? "A" : "B";
}

// Toutes les connexions Pronote (une par groupe : allemand, espagnol...)
export const listAuths = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("pronoteAuth").collect();
    return all.map((a) => ({
      id: a._id,
      label: a.label ?? "principal",
      url: a.url,
      username: a.username,
      token: a.token,
      deviceUUID: a.deviceUUID,
    }));
  },
});

export const saveAuth = internalMutation({
  args: {
    label: v.string(),
    url: v.string(),
    kind: v.float64(),
    username: v.string(),
    token: v.string(),
    deviceUUID: v.string(),
    classId: v.id("classes"),
    adminId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // On remplace seulement la connexion qui porte le même nom
    for (const old of await ctx.db.query("pronoteAuth").collect()) {
      if ((old.label ?? "principal") === args.label) await ctx.db.delete(old._id);
    }
    await ctx.db.insert("pronoteAuth", { ...args, updatedAt: Date.now() });
  },
});

export const updateToken = internalMutation({
  args: { id: v.id("pronoteAuth"), token: v.string(), username: v.string() },
  handler: async (ctx, { id, token, username }) => {
    await ctx.db.patch(id, { token, username, updatedAt: Date.now() });
  },
});

export const applyLessons = internalMutation({
  args: {
    authId: v.id("pronoteAuth"),
    lessons: v.array(
      v.object({
        date: v.string(), // YYYY-MM-DD
        start: v.string(), // HH:MM
        end: v.string(),
        subject: v.string(),
        teacher: v.optional(v.string()),
        room: v.optional(v.string()),
        color: v.optional(v.string()),
        cancelled: v.boolean(),
      })
    ),
  },
  handler: async (ctx, { authId, lessons }) => {
    const auth = await ctx.db.get(authId);
    if (!auth) return { updated: 0, cancelled: 0, unmatched: 0 };

    const anchor = await ctx.db.query("weekAnchor").first();
    const slots = await ctx.db
      .query("timetableSlots")
      .withIndex("by_class", (q) => q.eq("classId", auth.classId))
      .collect();

    const isPronote = (e: { reason?: string }) => !!e.reason?.includes("Pronote");

    let updated = 0, cancelled = 0, unmatched = 0;

    for (const l of lessons) {
      const day = DAYS[new Date(l.date + "T12:00:00Z").getUTCDay()];
      const wt = anchor ? weekTypeOf(l.date, anchor.startDay) : null;

      const cands = slots.filter(
        (s) =>
          s.day === day &&
          s.start === l.start &&
          (!wt || !s.weekType || s.weekType === "AB" || s.weekType === wt)
      );
      // 1) créneau de la même matière ; 2) sinon un seul créneau possible (remplacement)
      const slot =
        cands.find((s) => same(s.subject, l.subject)) ??
        (cands.length === 1 ? cands[0] : undefined);
      if (!slot) { unmatched++; continue; }

      const differs =
        !same(slot.subject, l.subject) ||
        !same(slot.teacher, l.teacher) ||
        !same(slot.room, l.room);

      // 1. Cours normal : on réécrit couleur / prof / salle comme sur Pronote
      if (!l.cancelled && !differs) {
        const patch: { color?: string; teacher?: string; room?: string; subject?: string } = {};
        if (l.color && l.color !== slot.color) patch.color = l.color;
        if (l.teacher && l.teacher !== slot.teacher) patch.teacher = l.teacher;
        if (l.room && l.room !== slot.room) patch.room = l.room;
        if (RENAME_SUBJECTS && l.subject !== slot.subject) patch.subject = l.subject;
        if (Object.keys(patch).length) {
          await ctx.db.patch(slot._id, patch);
          Object.assign(slot, patch);
          updated++;
        }
      }

      // 2. Ponctuel : annulation / remplacement pour CETTE date
      const exceptions = await ctx.db
        .query("slotExceptions")
        .withIndex("by_slot", (q) => q.eq("slotId", slot._id))
        .collect();
      const current = exceptions.find((e) => e.date === l.date);
      // On ne touche jamais aux exceptions créées à la main
      if (current && !isPronote(current)) continue;

      if (l.cancelled) {
        if (current?.kind === "cancelled") continue;
        if (current) await ctx.db.delete(current._id);
        await ctx.db.insert("slotExceptions", {
          slotId: slot._id, date: l.date, kind: "cancelled",
          reason: "Annulé (Pronote)", createdBy: auth.adminId, createdAt: Date.now(),
        });
        cancelled++;
      } else if (differs) {
        if (
          current?.kind === "replaced" &&
          current.replacementSubject === l.subject &&
          current.replacementTeacher === l.teacher &&
          current.replacementRoom === l.room &&
          current.replacementColor === l.color
        ) continue; // déjà à jour
        if (current) await ctx.db.delete(current._id);
        await ctx.db.insert("slotExceptions", {
          slotId: slot._id, date: l.date, kind: "replaced",
          reason: "Modifié (Pronote)",
          replacementSubject: l.subject,
          replacementTeacher: l.teacher,
          replacementRoom: l.room,
          replacementColor: l.color,
          createdBy: auth.adminId, createdAt: Date.now(),
        });
        updated++;
      } else if (current) {
        // Le cours est redevenu normal : on retire l'exception Pronote
        await ctx.db.delete(current._id);
        updated++;
      }
    }
    return { updated, cancelled, unmatched };
  },
});

// --- Suivi de statut (pour la page /pronote) ---

export const isAdminUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const me = await ctx.db.get(userId);
    return !!me && (me.isAdmin === true || me.role === "admin");
  },
});

export const recordRun = internalMutation({
  args: { authId: v.id("pronoteAuth"), ok: v.boolean(), message: v.string() },
  handler: async (ctx, { authId, ok, message }) => {
    const a = await ctx.db.get(authId);
    if (!a) return;
    await ctx.db.patch(a._id, {
      lastSyncAt: Date.now(),
      lastResult: ok ? message : undefined,
      lastError: ok ? undefined : message,
    });
  },
});

// Réservé aux admins. Ne renvoie jamais les jetons.
export const status = query({
  args: {},
  handler: async (ctx) => {
    const uid = await getAuthUserId(ctx);
    if (!uid) return null;
    const me = await ctx.db.get(uid);
    if (!me || !(me.isAdmin === true || me.role === "admin")) return null;
    const all = await ctx.db.query("pronoteAuth").collect();
    if (!all.length) return { connected: false as const };
    const a = all[0];
    return {
      connected: true as const,
      lastSyncAt: a.lastSyncAt ?? null,
      lastResult: a.lastResult ?? null,
      lastError: a.lastError ?? null,
      connections: all.map((c) => ({
        label: c.label ?? "principal",
        lastSyncAt: c.lastSyncAt ?? null,
        lastResult: c.lastResult ?? null,
        lastError: c.lastError ?? null,
      })),
    };
  },
});
