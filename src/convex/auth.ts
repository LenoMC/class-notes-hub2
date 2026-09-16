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

/** Envoi du code par email via le service email intégré de Freebuff. */
async function sendCodeEmail(email: string, token: string, kind: "verify" | "reset") {
  const subject =
    kind === "verify"
      ? "Votre code de vérification CoursFlow"
      : "Votre code de réinitialisation CoursFlow";
  const body =
    kind === "verify"
      ? `Bienvenue sur CoursFlow. Votre code de vérification : ${token}. Il expire dans 15 minutes.`
      : `Votre code de réinitialisation de mot de passe : ${token}. Il expire dans 15 minutes.`;

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
