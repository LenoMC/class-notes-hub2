// Configuration Convex Auth : email + mot de passe
// - Vérification email obligatoire à l'inscription et à chaque connexion
// - Réinitialisation de mot de passe ("mot de passe oublié") par code email

import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { Email } from "@convex-dev/auth/providers/Email";
import axios from "axios";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";

function randomCode(): string {
  const random: RandomReader = {
    read(bytes: Uint8Array) {
      crypto.getRandomValues(bytes);
    },
  };
  return generateRandomString(random, "0123456789", 6);
}

/** Envoi du code de vérification/réinitialisation via Resend (RESEND_API_KEY).
    Fallback sur le canal Freebuff si la clé Resend est absente. */
async function sendCodeEmail(email: string, token: string, kind: "verify" | "reset") {
  const subject =
    kind === "verify"
      ? "Votre code de vérification Classheure"
      : "Votre code de réinitialisation Classheure";
  const title =
    kind === "verify"
      ? "Vérification de votre adresse email"
      : "Réinitialisation de votre mot de passe";
  const intro =
    kind === "verify"
      ? "Bienvenue sur Classheure ! Saisissez ce code à 6 chiffres sur le site pour activer votre compte."
      : "Saisissez ce code à 6 chiffres sur le site pour choisir un nouveau mot de passe.";

  const html = `
    <div style="font-family:'Segoe UI',Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;background:#0b1020;color:#e6e9f5;border-radius:12px;overflow:hidden;border:1px solid #232a45">
      <div style="padding:20px 24px;background:#101735;border-bottom:1px solid #232a45">
        <h1 style="margin:0;font-size:18px;color:#8fa5ff">Classheure — ${title}</h1>
      </div>
      <div style="padding:24px;text-align:center">
        <p style="margin:0 0 18px;font-size:14px;line-height:1.6">${intro}</p>
        <div style="display:inline-block;background:#101735;border:1px solid #2c3760;border-radius:12px;padding:14px 28px;font-size:32px;font-weight:bold;letter-spacing:8px;color:#ffffff;font-family:'Courier New',monospace">${token}</div>
        <p style="margin:18px 0 0;font-size:12px;color:#8b93b8">Ce code expire dans 15 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>
      </div>
    </div>`;

  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      await axios.post(
        "https://api.resend.com/emails",
        {
          from: "Classheure <onboarding@resend.dev>",
          to: [email],
          subject,
          html,
        },
        {
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
        },
      );
      return;
    } catch (err) {
      console.warn("[auth] Resend a échoué, fallback Freebuff :", err);
    }
  }

  try {
    await axios.post(
      "https://auth.freebuff.app/send_otp",
      {
        to: email,
        otp: token,
        appName: process.env.VLY_APP_NAME || "a freebuff.com application",
      },
      {
        headers: {
          "x-api-key": "fb_email_2crN1hqIArZP2bEfvjp5Qik4",
        },
      },
    );
  } catch (error) {
    throw new Error(JSON.stringify(error));
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

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      id: "password",
      profile(params) {
        return {
          email: params.email as string,
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
      // Vérification email à l'inscription et à la connexion
      verify: freebuffEmailProvider("verify"),
      // Réinitialisation de mot de passe par code email
      reset: freebuffEmailProvider("reset"),
    }),
  ],
});
