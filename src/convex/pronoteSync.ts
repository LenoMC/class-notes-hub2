"use node";
// Actions Node : connexion à Pronote avec Pawnote.
import { action, internalAction, ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import * as pawnote from "pawnote";

export const ping = internalAction({
  args: {},
  handler: async () => {
    const url = "https://0762123v.index-education.net/pronote/mobile.eleve.html?fd=1";
    const r = await fetch(url);
    const t = await r.text();
    return { status: r.status, extrait: t.slice(0, 300) };
  },
});

async function safeFetch<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (e: any) {
    if (e?.name === "PageUnavailableError") {
      console.warn(`Page indisponible : ${label}`);
      return null;
    }
    throw e;
  }
}

type SyncResult = { updated: number; cancelled: number; unmatched: number };

// À lancer UNE fois depuis le dashboard Convex (Functions > pronoteSync:setup)
export const setup = internalAction({
  args: {
    jeton: v.string(),
    login: v.string(),
    url: v.string(),
    pin: v.string(),
    classId: v.id("classes"),
    adminId: v.id("users"),
  },
  handler: async (ctx, { jeton, login, url, pin, classId, adminId }) => {
    const handle = pawnote.createSessionHandle();
    const deviceUUID = "classheure-convex";
    const refresh: any = await pawnote.loginQrCode(handle, {
      deviceUUID,
      pin,
      qr: { jeton, login, url },
    } as any);
    await ctx.runMutation(internal.pronote.saveAuth, {
      url: refresh.url,
      kind: refresh.kind,
      username: refresh.username,
      token: refresh.token,
      deviceUUID,
      classId,
      adminId,
    });
    return "Connexion Pronote enregistrée.";
  },
});

async function runSync(ctx: ActionCtx): Promise<SyncResult> {
  const auth = await ctx.runQuery(internal.pronote.getAuth, {});
  if (!auth) throw new Error("Pas de connexion : lance d'abord pronoteSync:setup");

  try {
    const handle: any = pawnote.createSessionHandle();
    const refresh: any = await pawnote.loginToken(handle, {
      url: auth.url,
      kind: auth.kind as any,
      username: auth.username,
      token: auth.token,
      deviceUUID: auth.deviceUUID,
    });
    // Le jeton change à chaque connexion : on le sauvegarde.
    await ctx.runMutation(internal.pronote.updateToken, {
      id: auth._id,
      token: refresh.token,
      username: refresh.username,
    });

    const lessons: any[] = [];

    for (let i = 0; i < 3; i++) { // cette semaine + 2 suivantes
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + 7 * i);
      const week = pawnote.translateToWeekNumber(d, handle.instance.firstMonday);
      const tt: any = await pawnote.timetableFromWeek(handle, week);
      pawnote.parseTimetable(handle, tt, {
        withSuperposedCanceledClasses: false,
        withCanceledClasses: true,
        withPlannedClasses: true,
      });

      for (const c of tt.classes as any[]) {
        const subject =
          typeof c.subject === "string" ? c.subject : c.subject?.name;
        if (!subject || !c.startDate || !c.endDate) continue; // ignore activités, retenues...
        const start: Date = c.startDate;
        const end: Date = c.endDate;
        lessons.push({
          date: start.toISOString().slice(0, 10),
          start: start.toISOString().slice(11, 16),
          end: end.toISOString().slice(11, 16),
          subject,
          teacher: Array.isArray(c.teacherNames) && c.teacherNames.length
            ? c.teacherNames.join(", ")
            : undefined,
          room: Array.isArray(c.classrooms) && c.classrooms.length
            ? c.classrooms.join(", ")
            : undefined,
          color: c.backgroundColor || undefined,
          cancelled: !!c.canceled,
        });
      }
    }

    const res: SyncResult = await ctx.runMutation(internal.pronote.applyLessons, { lessons });
    await ctx.runMutation(internal.pronote.recordRun, {
      ok: true,
      message: `${lessons.length} cours lus : ${res.updated} mis à jour, ${res.cancelled} annulés, ${res.unmatched} sans correspondance`,
    });
    return res;
  } catch (e: any) {
    await ctx.runMutation(internal.pronote.recordRun, {
      ok: false,
      message: String(e?.message ?? e).slice(0, 500),
    });
    throw e;
  }
}

// Lancée par le cron toutes les 3 heures.
export const sync = internalAction({
  args: {},
  handler: async (ctx): Promise<SyncResult> => runSync(ctx),
});

// Bouton "Synchroniser maintenant" de la page /pronote (admins uniquement).
export const syncNow = action({
  args: {},
  handler: async (ctx): Promise<SyncResult> => {
    const uid = await getAuthUserId(ctx);
    if (!uid) throw new Error("Non connecté");
    const ok: boolean = await ctx.runQuery(internal.pronote.isAdminUser, { userId: uid });
    if (!ok) throw new Error("Réservé aux admins");
    return runSync(ctx);
  },
});
