"use node";
// Actions Node : connexion à Pronote avec Pawnote (npm i pawnote).
import { action, internalAction, ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import * as pawnote from "pawnote";

// À lancer UNE fois :
// npx convex run pronoteSync:setup '{"qr": {...}, "pin": "1234", "classId": "...", "adminId": "..."}'
export const setup = internalAction({
  args: {
    qr: v.any(),
    pin: v.string(),
    classId: v.id("classes"),
    adminId: v.id("users"),
  },
  handler: async (ctx, { qr, pin, classId, adminId }) => {
    const handle = pawnote.createSessionHandle();
    const deviceUUID = "classheure-convex";
    const refresh: any = await pawnote.loginQrCode(handle, { deviceUUID, pin, qr });
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

async function runSync(ctx: ActionCtx) {
  const auth = await ctx.runQuery(internal.pronote.getAuth, {});
  if (!auth) throw new Error("Pas de connexion : lance d'abord pronoteSync:setup");

  try {
    const handle: any = pawnote.createSessionHandle();
    const refresh: any = await pawnote.loginToken(handle, {
      url: auth.url,
      kind: auth.kind,
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

    const user = handle.user.resources[0];
    const lessons: any[] = [];

    for (let i = 0; i < 3; i++) { // cette semaine + 2 suivantes
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + 7 * i);
      const week = pawnote.translateToWeekNumber(d, handle.instance.firstMonday);
      const tt: any = await pawnote.timetableFromWeek(handle, user, week);
      pawnote.parseTimetable(tt, {
        withSuperposedCanceledClasses: false,
        withCanceledClasses: true,
        withPlannedClasses: true,
      });

      for (const c of tt.classes) {
        if (c.kind !== pawnote.TimetableClassKind.Lesson) continue;
        const start: Date = c.startDate;
        const end: Date = c.endDate;
        lessons.push({
          date: start.toISOString().slice(0, 10),
          start: start.toISOString().slice(11, 16),
          end: end.toISOString().slice(11, 16),
          subject: c.subject?.name ?? "",
          teacher: c.teacherNames?.join(", ") || undefined,
          room: c.classrooms?.join(", ") || undefined,
          color: c.backgroundColor || undefined,
          cancelled: !!c.canceled,
        });
      }
    }

    const res = await ctx.runMutation(internal.pronote.applyLessons, { lessons });
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

// Lancée par le cron, ou à la main : npx convex run pronoteSync:sync
export const sync = internalAction({
  args: {},
  handler: async (ctx) => runSync(ctx),
});

// Bouton "Synchroniser maintenant" de la page /pronote (admins uniquement).
export const syncNow = action({
  args: {},
  handler: async (ctx) => {
    const uid = await getAuthUserId(ctx);
    if (!uid) throw new Error("Non connecté");
    const ok = await ctx.runQuery(internal.pronote.isAdminUser, { userId: uid });
    if (!ok) throw new Error("Réservé aux admins");
    return runSync(ctx);
  },
});
