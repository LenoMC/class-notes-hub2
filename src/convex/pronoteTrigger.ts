import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";

export const syncNow = action({
  args: {},
  handler: async (ctx) => {
    const uid = await getAuthUserId(ctx);
    if (!uid) throw new ConvexError("Non connecté");
    const ok: boolean = await ctx.runQuery(internal.pronote.isAdminUser, { userId: uid });
    if (!ok) throw new ConvexError("Réservé aux admins");

    const repo = process.env.GITHUB_REPO;
    const token = process.env.GITHUB_TOKEN;
    if (!repo) throw new ConvexError("Variable Convex GITHUB_REPO manquante");
    if (!token) throw new ConvexError("Variable Convex GITHUB_TOKEN manquante");

    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "classheure",
    };

    const r = await fetch(
      `https://api.github.com/repos/${repo}/actions/workflows/pronote.yml/dispatches`,
      { method: "POST", headers, body: JSON.stringify({ ref: "main" }) },
    );
    if (!r.ok) {
      let detail = `GitHub ${r.status}`;
      if (r.status === 404) {
        const repoRes = await fetch(`https://api.github.com/repos/${repo}`, { headers });
        if (!repoRes.ok) {
          detail += ` : repo "${repo}" introuvable avec ce token (nom ou droits du token)`;
        } else {
          const wf = await fetch(`https://api.github.com/repos/${repo}/actions/workflows`, { headers });
          const data: any = await wf.json();
          const files = (data.workflows ?? []).map((w: any) => w.path).join(", ");
          detail += ` : repo OK, workflows trouvés : ${files || "aucun"}`;
        }
      } else {
        detail += " : " + (await r.text()).slice(0, 200);
      }
      throw new ConvexError(detail);
    }
    return { note: "Synchro lancée, résultat dans environ 1 minute" };
  },
});
