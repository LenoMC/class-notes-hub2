// Fonctions "normales" (runtime Convex) : stockage des connexions + mise à jour des cours.
import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { computeWeekState, WEEK_ANCHOR_DEFAULT } from "../lib/weeks";

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

        // Même ancre que le site (date par défaut si rien n'est enregistré)
    const anchorRow = await ctx.db.query("weekAnchor").first();
    const anchorDay = anchorRow?.startDay ?? WEEK_ANCHOR_DEFAULT;
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
        // Lettre de la semaine (A/B) comme sur le site, vacances comprises
        // Lettre de la semaine (A/B) : exactement le même calcul que le site,
    // avec la date du cours (pas le lundi).
    const weekOf = (date: string): "A" | "B" | null => {
      const st = computeWeekState(date, anchorDay, holidays);
      return st.isHoliday ? null : st.week;
    };

    const isPronote = (e: { reason?: string }) => !!e.reason?.includes("Pronote");

    // Réinitialiser : valeurs vues par créneau, sur toutes les semaines lues
    const seen = new Map<
      string,
      { slot: (typeof slots)[number]; teachers: Set<string>; rooms: Set<string> }
    >();

    let updated = 0, cancelled = 0, unmatched = 0;

    for (const l of lessons) {
      const day = DAYS[new Date(l.date + "T12:00:00Z").getUTCDay()];
      const wt = weekOf(l.date);

      const cands = slots.filter(
        (s) =>
          s.day === day &&
          s.start === l.start &&
          (!wt || !s.weekType || s.weekType === "AB" || s.weekType === wt)
      );
      const exact = cands.find((s) => sameSubject(s.subject, l.subject));
      const slot = exact ?? (cands.length === 1 ? cands[0] : undefined);
      if (!slot) { unmatched++; continue; }

      const exceptions = await ctx.db
        .query("slotExceptions")
        .withIndex("by_slot", (q) => q.eq("slotId", slot._id))
        .collect();
      const current = exceptions.find((e) => e.date === l.date);
      // Exception créée à la main : on n'y touche jamais
      if (current && !isPronote(current)) continue;

      // Réinitialiser : on note ce que dit Pronote pour ce créneau (cours normaux, même matière)
      if (reinit && exact && !l.cancelled) {
        const key = String(exact._id);
        const entry = seen.get(key) ?? {
          slot: exact,
          teachers: new Set<string>(),
          rooms: new Set<string>(),
        };
        if (l.teacher) entry.teachers.add(l.teacher);
        if (l.room) entry.rooms.add(l.room);
        seen.set(key, entry);
      }

      const differs =
        !sameSubject(slot.subject, l.subject) ||
        !sameAny(slot.teacher, l.teacher) ||
        !sameAny(slot.room, l.room);

      if (l.cancelled) {
        if (current?.kind === "cancelled") continue;
        if (current) await ctx.db.delete(current._id);
        await ctx.db.insert("slotExceptions", {
          slotId: slot._id, date: l.date, kind: "cancelled",
          reason: "Annulé (Pronote)", createdBy: auth.adminId, createdAt: Date.now(),
        });
        cancelled++;
      } else if (reinit) {
        // Le cours de base est corrigé plus bas : on retire l'ancienne exception Pronote
        if (current && exact) {
          await ctx.db.delete(current._id);
          updated++;
        }
      } else if (differs) {
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
        // Cours redevenu normal : on retire l'exception Pronote
        await ctx.db.delete(current._id);
        updated++;
      }
    }

    // Réinitialiser : on modifie le cours de base seulement si toutes les semaines sont d'accord
   if (reinit) {
      // Remet toutes les cases en « auto » (couleur officielle de la matière)
      for (const s of slots) {
        if (s.color !== undefined) {
          await ctx.db.patch(s._id, { color: undefined });
          updated++;
        }
      }

      for (const { slot, teachers, rooms } of seen.values()) {
        // ... le reste ne change pas
        const patch: { teacher?: string; room?: string } = {};
        if (teachers.size === 1) {
          const t = [...teachers][0];
          if (!slot.teacher || !sameAny(slot.teacher, t)) patch.teacher = t;
        }
        if (rooms.size === 1) {
          const r = [...rooms][0];
          if (!slot.room || !sameAny(slot.room, r)) patch.room = r;
        }
        if (Object.keys(patch).length) {
          await ctx.db.patch(slot._id, patch);
          updated++;
        }
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
