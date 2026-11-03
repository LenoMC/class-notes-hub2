// Fonctions "normales" (runtime Convex) : stockage des connexions + mise à jour des cours.
import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

// false = on garde les couleurs officielles des matières du site.
const SYNC_COLORS = false;

// true = en mode « réinitialiser », la matière du cours de base est aussi
// corrigée quand elle est vraiment différente de Pronote.
const REINIT_SUBJECT = true;

const DAYS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"] as const;

const STOP = new Set([
  "lv1", "lv2", "lv3", "de", "du", "des", "la", "le", "les", "et", "m", "mme", "mr", "mlle", "salle",
]);

const tokens = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !STOP.has(t));

// Matière : tous les mots de l'un sont dans l'autre ("Anglais LV1" = "Anglais")
const sameSubject = (a?: string, b?: string) => {
  if (!a || !b) return true;
  const x = tokens(a), y = tokens(b);
  if (!x.length || !y.length) return true;
  return x.every((t) => y.includes(t)) || y.every((t) => x.includes(t));
};

// Prof / salle : au moins un mot en commun ("M. DRONY" = "DRONY Jean")
const sameAny = (a?: string, b?: string) => {
  if (!a || !b) return true;
  const x = tokens(a), y = tokens(b);
  if (!x.length || !y.length) return true;
  return x.some((t) => y.includes(t));
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
    // refresh = exceptions de date seulement ; reinit = modifie aussi les cours de base
    mode: v.optional(v.union(v.literal("refresh"), v.literal("reinit"))),
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
  handler: async (ctx, { authId, mode, lessons }) => {
    const reinit = mode === "reinit";
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
        cands.find((s) => sameSubject(s.subject, l.subject)) ??
        (cands.length === 1 ? cands[0] : undefined);
      if (!slot) { unmatched++; continue; }

      const exceptions = await ctx.db
        .query("slotExceptions")
        .withIndex("by_slot", (q) => q.eq("slotId", slot._id))
        .collect();
      const current = exceptions.find((e) => e.date === l.date);
      // Exception créée à la main : on n'y touche jamais
      const manual = !!current && !isPronote(current);

      // --- MODE RÉINITIALISER : on modifie le cours de base (à la souche) ---
      if (reinit && !l.cancelled && !manual) {
        const patch: { subject?: string; teacher?: string; room?: string; color?: string } = {};
        if (REINIT_SUBJECT && !sameSubject(slot.subject, l.subject)) patch.subject = l.subject;
        if (l.teacher && (!slot.teacher || !sameAny(slot.teacher, l.teacher))) patch.teacher = l.teacher;
        if (l.room && (!slot.room || !sameAny(slot.room, l.room))) patch.room = l.room;
        if (SYNC_COLORS && l.color && l.color !== slot.color) patch.color = l.color;
        if (Object.keys(patch).length) {
          await ctx.db.patch(slot._id, patch);
          Object.assign(slot, patch);
          updated++;
        }
      }

      if (manual) continue;

      const differs =
        !sameSubject(slot.subject, l.subject) ||
        !sameAny(slot.teacher, l.teacher) ||
        !sameAny(slot.room, l.room);

      // --- Exceptions de date (annulation / remplacement) ---
      if (l.cancelled) {
        if (current?.kind === "cancelled") continue;
        if (current) await ctx.db.delete(current._id);
        await ctx.db.insert("slotExceptions", {
          slotId: slot._id, date: l.date, kind: "cancelled",
          reason: "Annulé (Pronote)", createdBy: auth.adminId, createdAt: Date.now(),
        });
        cancelled++;
      } else if (!reinit && differs) {
        const rColor = SYNC_COLORS ? l.color : undefined;
        if (
          current?.kind === "replaced" &&
          current.replacementSubject === l.subject &&
          current.replacementTeacher === l.teacher &&
          current.replacementRoom === l.room &&
          current.replacementColor === rColor
        ) continue; // déjà à jour
        if (current) await ctx.db.delete(current._id);
        await ctx.db.insert("slotExceptions", {
          slotId: slot._id, date: l.date, kind: "replaced",
          reason: "Modifié (Pronote)",
          replacementSubject: l.subject,
          replacementTeacher: l.teacher,
          replacementRoom: l.room,
          replacementColor: rColor,
          createdBy: auth.adminId, createdAt: Date.now(),
        });
        updated++;
      } else if (current) {
        // Cours redevenu normal (ou cours de base corrigé) : on retire l'exception Pronote
        await ctx.db.delete(current._id);
        updated++;
      }
    }
    return { updated, cancelled, unmatched };
  },
});

// À lancer UNE fois depuis le dashboard Convex : remet toutes les cases en « auto »
// (couleur officielle de la matière).
export const resetColors = internalMutation({
  args: {},
  handler: async (ctx) => {
    const auth = await ctx.db.query("pronoteAuth").first();
    if (!auth) return 0;
    const slots = await ctx.db
      .query("timetableSlots")
      .withIndex("by_class", (q) => q.eq("classId", auth.classId))
      .collect();
    let n = 0;
    for (const s of slots) {
      if (s.color !== undefined) {
        await ctx.db.patch(s._id, { color: undefined });
        n++;
      }
    }
    return n;
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
    return {
      connected: true as const,
      connections: all.map((c) => ({
        label: c.label ?? "principal",
        lastSyncAt: c.lastSyncAt ?? null,
        lastResult: c.lastResult ?? null,
        lastError: c.lastError ?? null,
      })),
    };
  },
});
