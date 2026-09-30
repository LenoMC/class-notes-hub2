// Configuration Convex Auth : email + mot de passe, téléphone + mot de passe
// - Email : vérification obligatoire à l'inscription (code 6 chiffres) et reset par code email
// - Téléphone : inscription/connexion sans vérification, "mot de passe oublié" par SMS (textbee)
// - Les emails sont normalisés en minuscules : Seressy@mail.com = seressy@mail.com

import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth, invalidateSessions } from "@convex-dev/auth/server";
import { Email } from "@convex-dev/auth/providers/Email";
import { Scrypt } from "lucia";
import axios from "axios";
import { sendSingleEmail } from "./emails";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
} from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

function randomCode(): string {
  const random: RandomReader = {
    read(bytes: Uint8Array) {
      crypto.getRandomValues(bytes);
    },
  };
  return generateRandomString(random, "0123456789", 6);
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const PHONE_RE = /^\+\d{8,15}$/;

/** Les emails sont tout en minuscules : la casse n'a aucune importance. */
function normalizeEmail(email: string): string {
  return (email ?? "").trim().toLowerCase();
}

/** Code de vérification / réinitialisation envoyé par email. */
async function sendCodeEmail(email: string, token: string, kind: "verify" | "reset") {
  const subject =
    kind === "verify"
      ? "Votre code de vérification ClassHeure"
      : "Votre code de réinitialisation ClassHeure";
  const title =
    kind === "verify"
      ? "Vérification de votre adresse email"
      : "Réinitialisation de votre mot de passe";
  const intro =
    kind === "verify"
      ? "Bienvenue sur ClassHeure ! Saisissez ce code à 6 chiffres sur le site pour activer votre compte."
      : "Saisissez ce code à 6 chiffres sur le site pour choisir un nouveau mot de passe.";

  const html = `
    <div style="font-family:'Segoe UI',Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;background:#0b1020;color:#e6e9f5;border-radius:12px;overflow:hidden;border:1px solid #232a45">
      <div style="padding:20px 24px;background:#101735;border-bottom:1px solid #232a45">
        <h1 style="margin:0;font-size:18px;color:#8fa5ff">ClassHeure — ${title}</h1>
      </div>
      <div style="padding:24px;text-align:center">
        <p style="margin:0 0 18px;font-size:14px;line-height:1.6">${intro}</p>
        <div style="display:inline-block;background:#101735;border:1px solid #2c3760;border-radius:12px;padding:14px 28px;font-size:32px;font-weight:bold;letter-spacing:8px;color:#ffffff;font-family:'Courier New',monospace">${token}</div>
        <p style="margin:18px 0 0;font-size:12px;color:#8b93b8">Ce code expire dans 15 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>
      </div>
    </div>`;

  // Resend (SDK officiel) puis fallback Freebuff — un seul destinataire ici.
  const ok = await sendSingleEmail(email, { subject, html, otp: token }, "auth");
  if (!ok) {
    throw new Error("Impossible d'envoyer l'email. Réessayez dans un instant.");
  }
}

function freebuffEmailProvider(kind: "verify" | "reset") {
  return Email({
    id: "email",
    maxAge: 60 * 15,
    generateVerificationToken: randomCode,
    async sendVerificationRequest({ identifier: email, token }) {
      await sendCodeEmail(email, token, kind);
    },
  });
}

/** Code de réinitialisation envoyé par SMS via textbee (téléphone Android). */
async function sendCodeSms(phone: string, token: string) {
  const apiKey = process.env.TEXTBEE_API_KEY;
  const deviceId =
    process.env.TEXTBEE_DEVICE_ID || process.env.TEXTBEE_PHONE_ID;
  if (!apiKey || !deviceId) {
    throw new Error(
      "L'envoi de SMS n'est pas disponible pour le moment. Contactez un administrateur.",
    );
  }
  const res = await axios.post(
    `https://api.textbee.dev/api/v1/gateway/devices/${deviceId}/send-sms`,
    {
      recipients: [phone],
      message: `ClassHeure : votre code de réinitialisation est ${token}. Il expire dans 15 minutes.`,
    },
    {
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      validateStatus: () => true,
    },
  );
  if (res.status >= 400) {
    console.warn(
      "[auth] textbee a refusé l'envoi du code : HTTP",
      res.status,
      typeof res.data === "object" ? JSON.stringify(res.data).slice(0, 300) : res.data,
    );
    throw new Error("Impossible d'envoyer le SMS. Réessayez dans un instant.");
  }
}

/** Provider "email" dont l'identifiant est un numéro de téléphone :
    le code de reset part par SMS. Utilisé par le provider "password-tel". */
function phoneResetProvider() {
  return Email({
    id: "phone",
    maxAge: 60 * 15,
    generateVerificationToken: randomCode,
    async sendVerificationRequest({ identifier, token }) {
      await sendCodeSms(identifier, token);
    },
  });
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    // ----- Email + mot de passe (vérification email obligatoire) -----
    Password({
      id: "password",
      profile(params) {
        return {
          // Normalisation : la casse de l'email est ignorée partout.
          email: normalizeEmail(params.email as string),
          ...(params.name ? { name: params.name as string } : {}),
          ...(params.firstName
            ? { firstName: params.firstName as string }
            : {}),
          ...(params.lastName ? { lastName: params.lastName as string } : {}),
        };
      },
      validatePasswordRequirements: (password: string) => {
        if (!password || password.length < 8) {
          throw new Error("Le mot de passe doit contenir au moins 8 caractères.");
        }
        // TODO: renforcer si besoin (majuscule, chiffre...)
      },
      verify: freebuffEmailProvider("verify"),
      reset: freebuffEmailProvider("reset"),
    }),
    // ----- Téléphone + mot de passe (sans vérification après inscription) -----
    // Le compte est stocké avec email = numéro (ex. +33612345678), provider
    // "password-tel". Le "reset" envoie le code par SMS (phoneResetProvider).
    Password({
      id: "password-tel",
      profile(params) {
        const phone = ((params.phone as string) ?? "").trim();
        if (!PHONE_RE.test(phone)) {
          throw new Error(
            "Numéro invalide : format international attendu, ex. +33612345678.",
          );
        }
        return {
          email: phone,
          ...(params.name ? { name: params.name as string } : {}),
          ...(params.firstName
            ? { firstName: params.firstName as string }
            : {}),
          ...(params.lastName ? { lastName: params.lastName as string } : {}),
        };
      },
      validatePasswordRequirements: (password: string) => {
        if (!password || password.length < 8) {
          throw new Error("Le mot de passe doit contenir au moins 8 caractères.");
        }
      },
      reset: phoneResetProvider(),
    }),
  ],
});

// ---------- Vérification du domaine email (l'adresse existe-t-elle ?) ----------

const WELL_KNOWN_EMAIL_DOMAINS = [
  "gmail.com", "outlook.com", "outlook.fr", "hotmail.com", "hotmail.fr",
  "live.com", "live.fr", "yahoo.com", "yahoo.fr", "icloud.com", "orange.fr",
  "wanadoo.fr", "free.fr", "sfr.fr", "laposte.net", "aol.com", "aliceadsl.fr",
  "proton.me", "protonmail.com", "mail.com", "mail.ru", "gmx.com", "gmx.fr",
  "zoho.com", "hey.com", "bbox.fr", "numericable.fr", "cegetel.net",
  "ac-normandie.fr", "ac-lyon.fr", "ac-paris.fr", "ac-bordeaux.fr",
  "ac-lille.fr", "ac-marseille.fr", "ac-nantes.fr", "ac-rennes.fr",
  "ac-strasbourg.fr", "ac-toulouse.fr", "ac-creteil.fr", "ac-versailles.fr",
  "ac-amiens.fr", "ac-caen.fr", "ac-dijon.fr", "ac-grenoble.fr",
  "ac-montpellier.fr", "ac-orleans-tours.fr", "ac-reims.fr", "ac-rouen.fr",
  "ac-clermont.fr", "ac-poitiers.fr", "ac-limoges.fr", "ac-corse.fr",
  "ac-guadeloupe.fr", "ac-martinique.fr", "ac-guyane.fr", "ac-reunion.fr",
  "education.fr", "monlycee.net", "edu.gov.fr",
];

async function dnsQuery(name: string, type: "MX" | "A") {
  const res = await fetch(
    `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`,
    { headers: { Accept: "application/json" } },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { Answer?: Array<{ data: string }> };
  return data.Answer && data.Answer.length > 0;
}

/** Vérification complète d'une adresse email avant d'envoyer un code :
 *  1. syntaxe + domaine (MX/A via DNS, gratuit) — rejette les fautes de frappe ;
 *  2. existence RÉELLE de la boîte via ZeroBounce (SMTP) si ZEROBOUNCE_API_KEY
 *     est configurée — évite de gaspiller un envoi Brevo sur une adresse
 *     invalide. Sans clé, on se contente du contrôle domaine. */
export const verifyEmailDeliverable = action({
  args: { email: v.string() },
  handler: async (_ctx, { email }) => {
    const normalized = normalizeEmail(email);
    const domain = normalized.split("@")[1];
    if (!normalized.includes("@") || !domain || !domain.includes(".")) {
      return { ok: false, reason: "syntaxe" as const };
    }

    // ----- 1) Contrôle SMTP de la boîte (ZeroBounce) — le plus fiable. —
    // Vérifie le domaine ET l'existence réelle de la boîte.
    const apiKey = process.env.ZEROBOUNCE_API_KEY;
    if (apiKey) {
      try {
        const res = await axios.get("https://api.zerobounce.net/v2/validate", {
          params: { api_key: apiKey, email: normalized },
          validateStatus: () => true,
        });
        if (res.status < 400) {
          const status = (res.data as { status?: string })?.status;
          // valid → la boîte existe ; catch-all → domaine qui accepte tout
          // (on laisse passer) ; invalid / do_not_mail / spamtrap… → rejet.
          if (status === "valid" || status === "catch-all") {
            return { ok: true, reason: "smtp" as const };
          }
          if (status) {
            return { ok: false, reason: "inexistante" as const };
          }
        } else {
          console.warn("[auth] ZeroBounce HTTP", res.status);
        }
      } catch (err) {
        console.warn("[auth] ZeroBounce a échoué :", err);
      }
    }

    // ----- 2) Secours sans clé : contrôle domaine (MX/A via DNS). -----
    if (WELL_KNOWN_EMAIL_DOMAINS.includes(domain)) {
      return { ok: true, reason: "domaine-connu" as const };
    }
    try {
      const hasMx =
        (await dnsQuery(domain, "MX")) || (await dnsQuery(domain, "A"));
      if (!hasMx) return { ok: false, reason: "domaine" as const };
    } catch (err) {
      console.warn("[auth] vérification DNS impossible :", err);
    }
    return { ok: true, reason: "domaine-seulement" as const };
  },
});

// ---------- Mot de passe oublié par téléphone (SMS textbee) ----------

/** [INTERNE] Le compte téléphone existe-t-il ? */
export const getPhoneUser = internalQuery({
  args: { phone: v.string() },
  handler: async (ctx, { phone }) => {
    return await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", phone))
      .first();
  },
});

/** [INTERNE] Stocke un code de reset SMS (supprime les codes précédents). */
export const createPhoneResetCode = internalMutation({
  args: { phone: v.string(), code: v.string() },
  handler: async (ctx, { phone, code }) => {
    const old = await ctx.db
      .query("phoneResetCodes")
      .withIndex("by_phone", (q) => q.eq("phone", phone))
      .collect();
    for (const row of old) await ctx.db.delete(row._id);
    await ctx.db.insert("phoneResetCodes", {
      phone,
      code,
      expiresAt: Date.now() + 15 * 60 * 1000,
    });
  },
});

/** Demande un code de réinitialisation par SMS pour un compte téléphone. */
export const requestPhonePasswordReset = action({
  args: { phone: v.string() },
  handler: async (ctx, { phone }) => {
    const normalized = phone.trim();
    if (!PHONE_RE.test(normalized)) {
      throw new Error(
        "Numéro invalide : format international attendu, ex. +33612345678.",
      );
    }
    const user = await ctx.runQuery(internal.auth.getPhoneUser, {
      phone: normalized,
    });
    if (!user) {
      throw new Error("Aucun compte n'existe avec ce numéro de téléphone.");
    }
    const token = randomCode();
    await ctx.runMutation(internal.auth.createPhoneResetCode, {
      phone: normalized,
      code: token,
    });
    await sendCodeSms(normalized, token);
    return true;
  },
});

/** Vérifie le code reçu par SMS et renvoie un jeton d'échange (15 min). */
export const verifyPhoneResetCode = mutation({
  args: { phone: v.string(), code: v.string() },
  handler: async (ctx, { phone, code }) => {
    const normalized = phone.trim();
    const row = await ctx.db
      .query("phoneResetCodes")
      .withIndex("by_phone", (q) => q.eq("phone", normalized))
      .first();
    if (!row || row.expiresAt < Date.now()) {
      throw new Error("Code expiré. Demandez un nouveau code.");
    }
    if (row.code !== code.trim()) {
      throw new Error("Code incorrect.");
    }
    const resetToken = randomToken();
    await ctx.db.patch(row._id, {
      resetToken,
      tokenExpiresAt: Date.now() + 15 * 60 * 1000,
    });
    return { token: resetToken };
  },
});

/** [INTERNE] Applique le nouveau mot de passe au compte téléphone. */
export const applyPhonePasswordReset = internalMutation({
  args: { phone: v.string(), passwordHash: v.string() },
  handler: async (ctx, { phone, passwordHash }) => {
    const account = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", "password-tel").eq("providerAccountId", phone),
      )
      .first();
    if (!account) throw new Error("Compte téléphone introuvable.");
    await ctx.db.patch(account._id, { secret: passwordHash });
    return account.userId;
  },
});

/** [INTERNE] Consomme le jeton de reset (usage unique), renvoie le compte. */
export const consumePhoneResetToken = internalMutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const row = await ctx.db
      .query("phoneResetCodes")
      .withIndex("by_token", (q) => q.eq("resetToken", token))
      .first();
    if (!row || !row.tokenExpiresAt || row.tokenExpiresAt < Date.now()) {
      throw new Error("Session de réinitialisation expirée. Recommencez.");
    }
    await ctx.db.delete(row._id);
    return row.phone;
  },
});

/** Applique le nouveau mot de passe (compte téléphone), jeton à usage unique. */
export const completePhonePasswordReset = action({
  args: { token: v.string(), newPassword: v.string() },
  handler: async (ctx, { token, newPassword }) => {
    if (!newPassword || newPassword.length < 8) {
      throw new Error("Le mot de passe doit contenir au moins 8 caractères.");
    }
    const phone = await ctx.runMutation(internal.auth.consumePhoneResetToken, {
      token,
    });
    const passwordHash = await new Scrypt().hash(newPassword);
    const userId = await ctx.runMutation(internal.auth.applyPhonePasswordReset, {
      phone,
      passwordHash,
    });
    // Déconnecte toutes les sessions de l'utilisateur (sécurité)
    await invalidateSessions(ctx, { userId, except: [] });
    return true;
  },
});
