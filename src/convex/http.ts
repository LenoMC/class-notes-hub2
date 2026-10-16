import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const ok = (req: Request) =>
  !!process.env.PRONOTE_SYNC_SECRET &&
  req.headers.get("x-sync-secret") === process.env.PRONOTE_SYNC_SECRET;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

http.route({
  path: "/pronote/credentials",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    if (!ok(req)) return json({ error: "forbidden" }, 403);
    const a = await ctx.runQuery(internal.pronote.getAuth, {});
    if (!a) return json({ error: "no auth" }, 404);
    return json({ url: a.url, username: a.username, token: a.token, deviceUUID: a.deviceUUID });
  }),
});

http.route({
  path: "/pronote/credentials",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!ok(req)) return json({ error: "forbidden" }, 403);
    const { token, username } = await req.json();
    const a = await ctx.runQuery(internal.pronote.getAuth, {});
    if (!a) return json({ error: "no auth" }, 404);
    await ctx.runMutation(internal.pronote.updateToken, { id: a._id, token, username });
    return json({ ok: true });
  }),
});

// Première connexion (appelée une seule fois par setup.py)
http.route({
  path: "/pronote/setup",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!ok(req)) return json({ error: "forbidden" }, 403);
    const b = await req.json();
    await ctx.runMutation(internal.pronote.saveAuth, {
      url: b.url, kind: 0, username: b.username, token: b.token,
      deviceUUID: b.deviceUUID, classId: b.classId, adminId: b.adminId,
    });
    return json({ ok: true });
  }),
});

http.route({
  path: "/pronote/lessons",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if (!ok(req)) return json({ error: "forbidden" }, 403);
    const { lessons, error } = await req.json();
    if (error) {
      await ctx.runMutation(internal.pronote.recordRun, { ok: false, message: String(error).slice(0, 500) });
      return json({ ok: false });
    }
    const res = await ctx.runMutation(internal.pronote.applyLessons, { lessons });
    await ctx.runMutation(internal.pronote.recordRun, {
      ok: true,
      message: `${lessons.length} cours lus : ${res.updated} mis à jour, ${res.cancelled} annulés, ${res.unmatched} sans correspondance`,
    });
    return json(res);
  }),
});

const http = httpRouter();

auth.addHttpRoutes(http);

export default http;
