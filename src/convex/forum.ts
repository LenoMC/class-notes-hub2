// Forum (questions/réponses de la classe) et Sondages (admins + responsables).
//
// Droits forum :
// - Tout le monde (classe définie) peut poser une question, répondre et voter.
// - Marquer « résolu » : créateur de la question, responsable de classe ou admin global.
// - Supprimer une question : créateur ou admin global uniquement.
//
// Sondages :
// - Création réservée aux admins globaux et responsables de classe (email aux membres).
// - Clôture : créateur, responsable ou admin global. Suppression : créateur ou admin global.

import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { v } from "convex/values";
import { action, internalQuery, mutation, query } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { sendEmailsIndividually } from "./emails";

type UserDoc = Doc<"users">;

async function requireUser(ctx: any): Promise<UserDoc> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Non connecté");
  const user = await ctx.db.get(userId);
  if (!user) {
    // Session orpheline (compte supprimé) : même convention que app.ts
    throw new ConvexError("SESSION_EXPIREE");
  }
  return user as UserDoc;
}

function canModerateForum(user: UserDoc): boolean {
  return !!user.isAdmin || !!user.isClassAdmin;
}

// ============================================================================
// Forum : questions/réponses
// ============================================================================

/** Liste les questions du forum de la classe (+ votes, réponses, droits). */
export const listForumThreads = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const classId = user.classId ?? user.adminOfClassId ?? null;
    if (!classId) return [];
    const rows = await ctx.db
      .query("forumThreads")
      .withIndex("by_class_created", (q) => q.eq("classId", classId))
      .order("desc")
      .collect();
    const result: Array<{
      _id: Id<"forumThreads">;
      title: string;
      body: string;
      subject: string | null;
      authorId: Id<"users">;
      authorName: string;
      mine: boolean;
      resolved: boolean;
      votes: number;
      voted: boolean;
      answerCount: number;
      createdAt: number;
      canResolve: boolean;
      canDelete: boolean;
    }> = [];
    for (const t of rows) {
      const votes = await ctx.db
        .query("forumVotes")
        .withIndex("by_thread", (q) => q.eq("threadId", t._id))
        .collect();
      const posts = await ctx.db
        .query("forumPosts")
        .withIndex("by_thread", (q) => q.eq("threadId", t._id))
        .collect();
      const author = await ctx.db.get(t.authorId);
      result.push({
        _id: t._id,
        title: t.title,
        body: t.body,
        subject: t.subject ?? null,
        authorId: t.authorId,
        authorName: author?.name ?? "Élève",
        mine: t.authorId === user._id,
        resolved: !!t.resolved,
        votes: votes.length,
        voted: votes.some((v) => v.userId === user._id),
        answerCount: posts.length,
        createdAt: t.createdAt,
        canResolve: t.authorId === user._id || canModerateForum(user),
        canDelete: t.authorId === user._id || !!user.isAdmin,
      });
    }
    return result;
  },
});

/** Crée une question dans le forum de sa classe. */
export const createForumThread = mutation({
  args: {
    title: v.string(),
    body: v.string(),
    subject: v.optional(v.string()),
  },
  handler: async (ctx, { title, body, subject }) => {
    const user = await requireUser(ctx);
    const classId = user.classId ?? user.adminOfClassId ?? null;
    if (!classId) {
      throw new Error("Rejoignez d'abord une classe pour poser une question.");
    }
    const t = title.trim();
    const b = body.trim();
    if (t.length < 5) throw new Error("Le titre doit faire au moins 5 caractères.");
    if (t.length > 120) throw new Error("Titre trop long (120 caractères maximum).");
    if (b.length < 10) throw new Error("Détaillez un peu votre question (10 caractères minimum).");
    if (b.length > 3000) throw new Error("Message trop long (3000 caractères maximum).");
    const now = Date.now();
    const threadId = await ctx.db.insert("forumThreads", {
      classId,
      authorId: user._id,
      title: t,
      body: b,
      ...(subject ? { subject } : {}),
      resolved: false,
      answerCount: 0,
      lastActivityAt: now,
      createdAt: now,
    });

    // Email aux membres de la classe (hors auteur) : nouvelle question.
    await ctx.scheduler.runAfter(0, api.forum.notifyNewForumThread, {
      threadId,
      authorName: user.name ?? user.email ?? "Quelqu'un",
      title: t,
      excerpt: b.length > 220 ? `${b.slice(0, 220)}…` : b,
    });
    return true;
  },
});

/** Détail d'une question : réponses, votes, droits de l'utilisateur courant. */
export const getForumThread = query({
  args: { threadId: v.id("forumThreads") },
  handler: async (ctx, { threadId }) => {
    const user = await requireUser(ctx);
    const t = await ctx.db.get(threadId);
    if (!t) throw new Error("Question introuvable.");
    const posts = await ctx.db
      .query("forumPosts")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId))
      .collect();
    const sorted = [...posts].sort((a, b) => a.createdAt - b.createdAt);
    const enrichedPosts: Array<{
      _id: Id<"forumPosts">;
      body: string;
      authorId: Id<"users">;
      authorName: string;
      mine: boolean;
      createdAt: number;
    }> = [];
    for (const p of sorted) {
      const author = await ctx.db.get(p.authorId);
      enrichedPosts.push({
        _id: p._id,
        body: p.body,
        authorId: p.authorId,
        authorName: author?.name ?? "Élève",
        mine: p.authorId === user._id,
        createdAt: p.createdAt,
      });
    }
    const votes = await ctx.db
      .query("forumVotes")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId))
      .collect();
    const author = await ctx.db.get(t.authorId);
    return {
      _id: t._id,
      title: t.title,
      body: t.body,
      subject: t.subject ?? null,
      authorId: t.authorId,
      authorName: author?.name ?? "Élève",
      mine: t.authorId === user._id,
      resolved: !!t.resolved,
      votes: votes.length,
      voted: votes.some((v) => v.userId === user._id),
      createdAt: t.createdAt,
      canResolve: t.authorId === user._id || canModerateForum(user),
      canDelete: t.authorId === user._id || !!user.isAdmin,
      posts: enrichedPosts,
    };
  },
});

/** Répond à une question du forum. */
export const answerForumThread = mutation({
  args: { threadId: v.id("forumThreads"), body: v.string() },
  handler: async (ctx, { threadId, body }) => {
    const user = await requireUser(ctx);
    const t = await ctx.db.get(threadId);
    if (!t) throw new Error("Question introuvable.");
    const b = body.trim();
    if (!b) throw new Error("Réponse vide.");
    if (b.length > 3000) throw new Error("Réponse trop longue (3000 caractères maximum).");
    const now = Date.now();
    await ctx.db.insert("forumPosts", {
      threadId,
      authorId: user._id,
      body: b,
      createdAt: now,
    });
    await ctx.db.patch(threadId, {
      answerCount: (t.answerCount ?? 0) + 1,
      lastActivityAt: now, // fait remonter le point rouge du forum
    });
    return true;
  },
});

/** Vote (upvote) pour une question — re-cliquer retire le vote. */
export const voteForumThread = mutation({
  args: { threadId: v.id("forumThreads") },
  handler: async (ctx, { threadId }) => {
    const user = await requireUser(ctx);
    const t = await ctx.db.get(threadId);
    if (!t) throw new Error("Question introuvable.");
    const existing = await ctx.db
      .query("forumVotes")
      .withIndex("by_thread_user", (q) =>
        q.eq("threadId", threadId).eq("userId", user._id),
      )
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
      return { voted: false };
    }
    await ctx.db.insert("forumVotes", { threadId, userId: user._id });
    await ctx.db.patch(threadId, { lastActivityAt: Date.now() });
    return { voted: true };
  },
});

/** Marque une question comme résolue (ou l'inverse) : créateur, responsable
 *  de classe ou admin global. */
export const resolveForumThread = mutation({
  args: { threadId: v.id("forumThreads"), resolved: v.boolean() },
  handler: async (ctx, { threadId, resolved }) => {
    const user = await requireUser(ctx);
    const t = await ctx.db.get(threadId);
    if (!t) throw new Error("Question introuvable.");
    if (t.authorId !== user._id && !canModerateForum(user)) {
      throw new Error(
        "Seul le créateur, un responsable de classe ou un administrateur peut marquer cette question résolue.",
      );
    }
    await ctx.db.patch(threadId, {
      resolved,
      ...(resolved ? { resolvedById: user._id, resolvedAt: Date.now() } : {}),
    });
    return true;
  },
});

/** Supprime une question : créateur ou admin global (réponses et votes
 *  supprimés avec). */
export const deleteForumThread = mutation({
  args: { threadId: v.id("forumThreads") },
  handler: async (ctx, { threadId }) => {
    const user = await requireUser(ctx);
    const t = await ctx.db.get(threadId);
    if (!t) throw new Error("Question introuvable.");
    if (t.authorId !== user._id && !user.isAdmin) {
      throw new Error(
        "Seul le créateur de la question ou un administrateur peut la supprimer.",
      );
    }
    const posts = await ctx.db
      .query("forumPosts")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId))
      .collect();
    for (const p of posts) await ctx.db.delete(p._id);
    const votes = await ctx.db
      .query("forumVotes")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId))
      .collect();
    for (const vt of votes) await ctx.db.delete(vt._id);
    await ctx.db.delete(threadId);
    return true;
  },
});

/** Supprime sa propre réponse (une réponse d'un autre : admin global only). */
export const deleteForumPost = mutation({
  args: { postId: v.id("forumPosts") },
  handler: async (ctx, { postId }) => {
    const user = await requireUser(ctx);
    const p = await ctx.db.get(postId);
    if (!p) throw new Error("Réponse introuvable.");
    if (p.authorId !== user._id && !user.isAdmin) {
      throw new Error("Vous ne pouvez supprimer que vos propres réponses.");
    }
    const t = await ctx.db.get(p.threadId);
    if (t) {
      await ctx.db.patch(t._id, {
        answerCount: Math.max(0, (t.answerCount ?? 1) - 1),
      });
    }
    await ctx.db.delete(postId);
    return true;
  },
});

// ============================================================================
// Sondages
// ============================================================================

/** Liste les sondages de la classe (+ mon vote et les résultats). */
export const listPolls = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const classId = user.classId ?? user.adminOfClassId ?? null;
    if (!classId) return [];
    const rows = await ctx.db
      .query("polls")
      .withIndex("by_class", (q) => q.eq("classId", classId))
      .order("desc")
      .collect();
    // Les sondages prives n'existent pas pour les non-responsables.
    const moderator = canModerateForum(user);
    const visible = rows.filter(
      (p) => moderator || p.visibility !== "admins",
    );
    const result: Array<{
      _id: Id<"polls">;
      question: string;
      options: string[];
      closed: boolean;
      mine: boolean;
      myChoice: number | null;
      counts: number[];
      total: number;
      authorName: string;
      createdAt: number;
      canClose: boolean;
      canDelete: boolean;
      visibility: "class" | "admins";
    }> = [];
    for (const p of visible) {
      const votes = await ctx.db
        .query("pollVotes")
        .withIndex("by_poll", (q) => q.eq("pollId", p._id))
        .collect();
      const counts = p.options.map(
        (_, i) => votes.filter((v) => v.choice === i).length,
      );
      const mine = votes.find((v) => v.userId === user._id);
      const author = await ctx.db.get(p.authorId);
      result.push({
        _id: p._id,
        question: p.question,
        options: p.options,
        closed: !!p.closed,
        mine: p.authorId === user._id,
        myChoice: mine ? mine.choice : null,
        counts,
        total: votes.length,
        authorName: author?.name ?? "Encadrant",
        createdAt: p.createdAt,
        canClose: p.authorId === user._id || canModerateForum(user),
        canDelete: p.authorId === user._id || !!user.isAdmin,
        visibility: p.visibility === "admins" ? "admins" : "class",
      });
    }
    return result;
  },
});

/** Crée un sondage et programme l'email à tous les membres de la classe. */
export const createPoll = mutation({
  args: {
    question: v.string(),
    options: v.array(v.string()),
    visibility: v.optional(
      v.union(v.literal("class"), v.literal("admins")),
    ),
  },
  handler: async (ctx, { question, options, visibility: visibilityArg }) => {
    const user = await requireUser(ctx);
    if (!canModerateForum(user)) {
      throw new Error(
        "Seuls les administrateurs globaux et les responsables de classe peuvent créer un sondage.",
      );
    }
    const classId = user.classId ?? user.adminOfClassId ?? null;
    if (!classId) throw new Error("Classe introuvable.");
    const q = question.trim();
    if (q.length < 5) throw new Error("La question doit faire au moins 5 caractères.");
    if (q.length > 200) throw new Error("Question trop longue (200 caractères maximum).");
    const opts = options.map((o) => o.trim()).filter(Boolean);
    if (opts.length < 2) throw new Error("Il faut au moins 2 choix.");
    if (opts.length > 6) throw new Error("6 choix maximum.");
    if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) {
      throw new Error("Les choix doivent être tous différents.");
    }
    for (const o of opts) {
      if (o.length > 80) throw new Error("Un choix est trop long (80 caractères maximum).");
    }
    // "admins" = sondage prive : visible uniquement par les responsables.
    const visibility = visibilityArg === "admins" ? "admins" : "class";
    await ctx.db.insert("polls", {
      classId,
      authorId: user._id,
      question: q,
      options: opts,
      visibility,
      createdAt: Date.now(),
    });

    // Email à tous les membres de la classe (hors créateur)
    // Sondage prive : aucun email aux membres de la classe.
    if (visibility !== "admins") {
      const members = (
        await ctx.db
          .query("users")
          .withIndex("by_class", (q) => q.eq("classId", classId))
          .collect()
      ).filter((m) => m._id !== user._id && m.email && m.email.includes("@"));
      if (members.length > 0) {
        await ctx.scheduler.runAfter(0, api.forum.sendPollEmails, {
          to: members.map((m) => m.email!),
          question: q,
          authorName: user.name ?? "Votre encadrant",
        });
      }
    }
    return true;
  },
});

/** Envoi des emails « nouveau sondage » : un envoi PAR destinataire.
 *  En mode test Resend, une adresse refusée n'annule plus l'envoi aux
 *  autres membres ; fallback Freebuff individuel. */
export const sendPollEmails = action({
  args: {
    to: v.array(v.string()),
    question: v.string(),
    authorName: v.string(),
  },
  handler: async (_ctx, { to, question, authorName }) => {
    if (to.length === 0) return;
    const siteUrl = process.env.PUBLIC_SITE_URL || "";
    const subject = `ClassHeure — nouveau sondage : ${question}`;
    const html = `
      <div style="font-family:'Segoe UI',Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;background:#0b1020;color:#e6e9f5;border-radius:12px;overflow:hidden;border:1px solid #232a45">
        <div style="padding:20px 24px;background:#101735;border-bottom:1px solid #232a45">
          <h1 style="margin:0;font-size:18px;color:#8fa5ff">ClassHeure — Nouveau sondage</h1>
        </div>
        <div style="padding:24px">
          <p style="margin:0 0 12px;font-size:14px;line-height:1.6">
            <strong>${authorName}</strong> vous demande votre avis :
          </p>
          <p style="margin:0 0 18px;font-size:16px;font-weight:bold;line-height:1.5">« ${question} »</p>
          ${
            siteUrl
              ? `<a href="${siteUrl}/sondages" style="display:inline-block;background:#4c6ef5;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold;font-size:14px">Voter maintenant</a>`
              : `<p style="font-size:13px;color:#8b93b8">Connectez-vous au site pour voter (menu Sondages).</p>`
          }
          <p style="margin:20px 0 0;font-size:12px;color:#8b93b8">
            Vous recevez cet email car vous êtes membre de la classe sur ClassHeure.
          </p>
        </div>
      </div>`;
    await sendEmailsIndividually(to, { subject, html }, "sondages");
  },
});

/** Vote à un sondage (modifiable tant que le sondage est ouvert). */
export const votePoll = mutation({
  args: { pollId: v.id("polls"), choice: v.number() },
  handler: async (ctx, { pollId, choice }) => {
    const user = await requireUser(ctx);
    const p = await ctx.db.get(pollId);
    if (!p) throw new Error("Sondage introuvable.");
    if (p.closed) throw new Error("Ce sondage est clôturé.");
    if (choice < 0 || choice >= p.options.length) {
      throw new Error("Choix invalide.");
    }
    const existing = await ctx.db
      .query("pollVotes")
      .withIndex("by_poll_user", (q) =>
        q.eq("pollId", pollId).eq("userId", user._id),
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { choice });
    } else {
      await ctx.db.insert("pollVotes", { pollId, userId: user._id, choice });
    }
    return true;
  },
});

/** Clôture un sondage (créateur, responsable de classe, admin global). */
export const closePoll = mutation({
  args: { pollId: v.id("polls") },
  handler: async (ctx, { pollId }) => {
    const user = await requireUser(ctx);
    const p = await ctx.db.get(pollId);
    if (!p) throw new Error("Sondage introuvable.");
    if (p.authorId !== user._id && !canModerateForum(user)) {
      throw new Error("Vous ne pouvez pas clôturer ce sondage.");
    }
    if (p.closed) throw new Error("Sondage déjà clôturé.");
    await ctx.db.patch(pollId, { closed: true, closedAt: Date.now() });
    return true;
  },
});

/** Supprime un sondage : créateur ou admin global. */
export const deletePoll = mutation({
  args: { pollId: v.id("polls") },
  handler: async (ctx, { pollId }) => {
    const user = await requireUser(ctx);
    const p = await ctx.db.get(pollId);
    if (!p) throw new Error("Sondage introuvable.");
    if (p.authorId !== user._id && !user.isAdmin) {
      throw new Error(
        "Seul le créateur du sondage ou un administrateur peut le supprimer.",
      );
    }
    const votes = await ctx.db
      .query("pollVotes")
      .withIndex("by_poll", (q) => q.eq("pollId", pollId))
      .collect();
    for (const v of votes) await ctx.db.delete(v._id);
    await ctx.db.delete(pollId);
    return true;
  },
});

// ============================================================================
// Email « nouvelle question » (action schedulée par createForumThread)
// ============================================================================

/** Interne : emails des membres de la classe du fil, hors auteur et hors
 *  comptes anonymes. */
export const forumRecipientsInternal = internalQuery({
  args: { threadId: v.id("forumThreads") },
  handler: async (ctx, { threadId }) => {
    const t = await ctx.db.get(threadId);
    if (!t) return { emails: [] as string[], className: "" };
    const members = await ctx.db
      .query("users")
      .withIndex("by_class", (q) => q.eq("classId", t.classId))
      .collect();
    return {
      emails: members
        .filter((u) => !u.isAnonymous && u._id !== t.authorId)
        .map((u) => u.email ?? "")
        .filter((e) => e.includes("@")),
      className: (await ctx.db.get(t.classId))?.name ?? "",
    };
  },
});

/** Envoie l'email « nouvelle question sur le forum » aux membres de la
 *  classe (hors auteur). Schedulé depuis createForumThread. */
export const notifyNewForumThread = action({
  args: {
    threadId: v.id("forumThreads"),
    authorName: v.string(),
    title: v.string(),
    excerpt: v.string(),
  },
  handler: async (ctx, { threadId, authorName, title, excerpt }) => {
    const siteUrl = process.env.PUBLIC_SITE_URL || "";
    const { emails, className } = await ctx.runQuery(
      internal.forum.forumRecipientsInternal,
      { threadId },
    );
    if (emails.length === 0) return true;

    const subject = `ClassHeure — nouvelle question sur le forum${className ? ` (${className})` : ""}`;
    const html = `
      <div style="font-family:'Segoe UI',Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;background:#0b1020;color:#e6e9f5;border-radius:12px;overflow:hidden;border:1px solid #232a45">
        <div style="padding:20px 24px;background:#101735;border-bottom:1px solid #232a45">
          <h1 style="margin:0;font-size:18px;color:#8fa5ff">ClassHeure — Forum</h1>
        </div>
        <div style="padding:24px">
          <p style="margin:0 0 12px;font-size:14px;line-height:1.6">
            <strong>${authorName}</strong> a posé une nouvelle question${className ? ` en ${className}` : ""} :
          </p>
          <p style="margin:0 0 10px;font-size:15px;font-weight:bold">${title}</p>
          <p style="margin:0 0 18px;font-size:14px;background:#101735;border:1px solid #2c3760;border-radius:10px;padding:14px;line-height:1.6">${excerpt}</p>
          ${
            siteUrl
              ? `<a href="${siteUrl}/forum" style="display:inline-block;background:#4c6ef5;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold;font-size:14px">Répondre sur le forum</a>`
              : ""
          }
          <p style="margin:20px 0 0;font-size:12px;color:#8b93b8">
            Vous recevez cet email car vous êtes membre de la classe.
          </p>
        </div>
      </div>`;
    await sendEmailsIndividually(emails, { subject, html }, "forum");
    return true;
  },
});

/** Dernier fil créé par quelqu'un d'autre (flux temps réel pour les
 *  notifications navigateur). */
export const getLatestForumThread = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const classId = user.classId ?? user.adminOfClassId ?? null;
    if (!classId) return null;
    const rows = await ctx.db
      .query("forumThreads")
      .withIndex("by_class", (q) => q.eq("classId", classId))
      .order("desc")
      .take(1);
    const t = rows[0];
    if (!t || t.authorId === user._id) return null;
    return {
      _id: t._id as string,
      title: t.title,
      authorName: (await ctx.db.get(t.authorId))?.name ?? "Quelqu'un",
      createdAt: t.createdAt,
    };
  },
});

/** Dernier sondage créé par quelqu'un d'autre (notifications navigateur). */
export const getLatestPoll = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const classId = user.classId ?? user.adminOfClassId ?? null;
    if (!classId) return null;
    const rows = await ctx.db
      .query("polls")
      .withIndex("by_class", (q) => q.eq("classId", classId))
      .order("desc")
      .take(20);
    const moderator = canModerateForum(user);
    const p = rows.find(
      (row) =>
        row.authorId !== user._id &&
        (moderator || row.visibility !== "admins"),
    );
    if (!p) return null;
    return {
      _id: p._id as string,
      question: p.question,
      authorName: (await ctx.db.get(p.authorId))?.name ?? "Un encadrant",
      createdAt: p.createdAt,
    };
  },
});

/** Qui a voté quoi : noms par choix. Reserve aux admins et au createur
 *  du sondage. */
export const getPollVoters = query({
  args: { pollId: v.id("polls") },
  handler: async (ctx, { pollId }) => {
    const user = await requireUser(ctx);
    const p = await ctx.db.get(pollId);
    if (!p) throw new Error("Sondage introuvable.");
    if (p.authorId !== user._id && !canModerateForum(user)) {
      throw new Error(
        "Seuls les responsables et l'auteur du sondage peuvent voir les votants.",
      );
    }
    const votes = await ctx.db
      .query("pollVotes")
      .withIndex("by_poll", (q) => q.eq("pollId", pollId))
      .collect();
    const byChoice: string[][] = p.options.map(() => []);
    for (const vote of votes) {
      if (vote.choice < 0 || vote.choice >= byChoice.length) continue;
      const voter = await ctx.db.get(vote.userId);
      byChoice[vote.choice].push(voter?.name ?? "Membre de la classe");
    }
    return byChoice.map((names) =>
      names.sort((a, b) => a.localeCompare(b, "fr")),
    );
  },
});
