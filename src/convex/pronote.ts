// Fonctions "normales" (runtime Convex) : stockage du jeton + mise à jour des cours.
import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

const DAYS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"] as const;

const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

// Hypothèse : weekAnchor.startDay = un lundi d'une semaine "A" (format YYYY-MM-DD).
function weekTypeOf(date: string, anchor: string): "A" | "B" {
  const diff = Date.parse(date + "T00:00:00Z") - Date.parse(anchor + "T00:00:00Z");
  const weeks = Math.floor(diff / (7 * 86400000));
  return ((weeks % 2) + 2) % 2 === 0 ? "A" : "B";
}

export const getAuth = internalQuery({
  args: {},
  handler: async (ctx) => ctx.db.query("pronoteAuth").first(),
});

export const saveAuth = internalMutation({
  args: {
    url: v.string(),
    kind: v.float64(),
    username: v.string(),
    token: v.string(),
    deviceUUID: v.string(),
    classId: v.id("classes"),
    adminId: v.id("users"),
  },
  handler: async (ctx, args) => {
    for (const old of await ctx.db.query("pronoteAuth").collect()) {
      await ctx.db.delete(old._id);
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
  handler: async (ctx, { lessons }) => {
    const auth = await ctx.db.query("pronoteAuth").first();
    if (!auth) return { updated: 0, cancelled: 0, unmatched: 0 };

    const anchor = await ctx.db.query("weekAnchor").first();
    const slots = await ctx.db
      .query("timetableSlots")
      .withIndex("by_class", (q) => q.eq("classId", auth.classId))
      .collect();

    let updated = 0, cancelled = 0, unmatched = 0;

    for (const l of lessons) {
      const day = DAYS[new Date(l.date + "T12:00:00Z").getUTCDay()];
      const wt = anchor ? weekTypeOf(l.date, anchor.startDay) : null;

      let cands = slots.filter(
        (s) =>
          s.day === day &&
          s.start === l.start &&
          (!wt || !s.weekType || s.weekType === "AB" || s.weekType === wt)
      );
      if (cands.length > 1) {
        const ls = norm(l.subject);
        const bySubject = cands.filter((s) => {
          const ss = norm(s.subject);
          return ss.includes(ls) || ls.includes(ss);
        });
        if (bySubject.length) cands = bySubject;
      }
      const slot = cands[0];
      if (!slot) { unmatched++; continue; }

      // On ne modifie que couleur / prof / salle : les fiches liées au cours restent intactes.
      const patch: { color?: string; teacher?: string; room?: string } = {};
      if (l.color && l.color !== slot.color) patch.color = l.color;
      if (l.teacher && l.teacher !== slot.teacher) patch.teacher = l.teacher;
      if (l.room && l.room !== slot.room) patch.room = l.room;
      if (Object.keys(patch).length) {
        await ctx.db.patch(slot._id, patch);
        Object.assign(slot, patch);
        updated++;
      }

      if (l.cancelled) {
        const existing = await ctx.db
          .query("slotExceptions")
          .withIndex("by_slot", (q) => q.eq("slotId", slot._id))
          .collect();
        if (!existing.some((e) => e.date === l.date)) {
          await ctx.db.insert("slotExceptions", {
            createdAt: Date.now(),
            createdBy: auth.adminId,
            date: l.date,
            kind: "cancelled",
            reason: "Annulé (Pronote)",
            slotId: slot._id,
          });
          cancelled++;
        }
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
  args: { ok: v.boolean(), message: v.string() },
  handler: async (ctx, { ok, message }) => {
    const a = await ctx.db.query("pronoteAuth").first();
    if (!a) return;
    await ctx.db.patch(a._id, {
      lastSyncAt: Date.now(),
      lastResult: ok ? message : undefined,
      lastError: ok ? undefined : message,
    });
  },
});

// Réservé aux admins. Ne renvoie jamais le jeton.
export const status = query({
  args: {},
  handler: async (ctx) => {
    const uid = await getAuthUserId(ctx);
    if (!uid) return null;
    const me = await ctx.db.get(uid);
    if (!me || !(me.isAdmin === true || me.role === "admin")) return null;
    const a = await ctx.db.query("pronoteAuth").first();
    if (!a) return { connected: false as const };
    return {
      connected: true as const,
      lastSyncAt: a.lastSyncAt ?? null,
      lastResult: a.lastResult ?? null,
      lastError: a.lastError ?? null,
    };
  },
});
