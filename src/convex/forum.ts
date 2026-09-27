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
import axios from "axios";
import { v } from "convex/values";
import { action, mutation, query } from "./_generated/server";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";

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
    await ctx.db.insert("forumThreads", {
      classId,
      authorId: user._id,
      title: t,
      body: b,
      ...(subject ? { subject } : {}),
      resolved: false,
      answerCount: 0,
      createdAt: Date.now(),
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
    await ctx.db.insert("forumPosts", {
      threadId,
      authorId: user._id,
      body: b,
      createdAt: Date.now(),
    });
    await ctx.db.patch(threadId, {
      answerCount: (t.answerCount ?? 0) + 1,
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
    }> = [];
    for (const p of rows) {
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
  },
  handler: async (ctx, { question, options }) => {
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
    await ctx.db.insert("polls", {
      classId,
      authorId: user._id,
      question: q,
      options: opts,
      createdAt: Date.now(),
    });

    // Email à tous les membres de la classe (hors créateur)
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
    return true;
  },
});

/** Envoi des emails « nouveau sondage » (Resend, fallback Freebuff). */
export const sendPollEmails = action({
  args: {
    to: v.array(v.string()),
    question: v.string(),
    authorName: v.string(),
  },
  handler: async (_ctx, { to, question, authorName }) => {
    if (to.length === 0) return;
    const siteUrl = process.env.PUBLIC_SITE_URL || "";
    const apiKey = process.env.RESEND_API_KEY;
    const subject = `Classheure — nouveau sondage : ${question}`;
    const html = `
      <div style="font-family:'Segoe UI',Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;background:#0b1020;color:#e6e9f5;border-radius:12px;overflow:hidden;border:1px solid #232a45">
        <div style="padding:20px 24px;background:#101735;border-bottom:1px solid #232a45">
          <h1 style="margin:0;font-size:18px;color:#8fa5ff">Classheure — Nouveau sondage</h1>
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
            Vous recevez cet email car vous êtes membre de la classe sur Classheure.
          </p>
        </div>
      </div>`;
    if (apiKey) {
      try {
        await axios.post(
          "https://api.resend.com/emails",
          { from: "Classheure <onboarding@resend.dev>", to, subject, html },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
          },
        );
        return;
      } catch (err) {
        console.warn("[sondages] Resend a échoué :", err);
      }
    }
    // Fallback : canal Freebuff, un envoi par destinataire (limité à 20)
    for (const email of to.slice(0, 20)) {
      try {
        await axios.post(
          "https://auth.freebuff.app/send_otp",
          {
            to: email,
            otp: `Sondage : ${question} — connectez-vous pour voter`,
            appName: process.env.VLY_APP_NAME || "a freebuff.com application",
          },
          { headers: { "x-api-key": "fb_email_2crN1hqIArZP2bEfvjp5Qik4" } },
        );
      } catch (err) {
        console.warn("[sondages] fallback Freebuff a échoué pour", email, err);
      }
    }
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
