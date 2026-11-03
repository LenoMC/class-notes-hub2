// Fonctions "normales" (runtime Convex) : stockage des connexions + mise à jour des cours.
import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { computeWeekState } from "../lib/weeks";

// false = on garde les couleurs officielles des matières du site.
const SYNC_COLORS = false;

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

function mondayOf(date: string): string {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
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
    // refresh = exceptions de date seulement ; reinit = modifie aussi prof/salle des cours de base
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
    const holidays = (await ctx.db.query("holidays").collect()).map((h) => ({
      label: h.label,
      startDay: h.startDay,
      endDay: h.endDay,
    }));
    const slots = await ctx.db
      .query("timetableSlots")
      .withIndex("by_class", (q) => q.eq("classId", auth.classId))
      .collect();

    // Lettre de la semaine (A/B) comme sur le site, vacances comprises
    const weekOf = (date: string): "A" | "B" | null => {
      if (!anchor) return null;
      const monday = mondayOf(date);
      if (holidays.some((h) => monday >= h.startDay && monday <= h.endDay)) return null;
      return computeWeekState(monday, anchor.startDay, holidays).week as "A" | "B";
    };

    const isPronote = (e: { reason?: string }) => !!e.reason?.includes("Pronote");

    // Réinitialiser : valeurs vues par créneau, sur toutes
