import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";

export const syncNow = action({
  args: {},
  handler: async (ctx) => {
    const uid = await getAuthUserId(ctx);
    if (!uid) throw new Error("Non connecté");
    const ok: boolean = await ctx.runQuery(internal.pronote.isAdminUser, { userId: uid });
    if (!ok) throw new Error("Réservé aux admins");

    const r = await fetch(
      `https://api.github.com/repos/${process.env.GITHUB_REPO}/actions/workflows/pronote.yml/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
        },
        body: JSON.stringify({ ref: "main" }),
      },
    );
    if (!r.ok) throw new Error("GitHub : " + r.status + " " + (await r.text()).slice(0, 200));
    return { note: "Synchro lancée, résultat dans environ 1 minute" };
  },
});
