// Envoi d'emails transactionnels Classheure — chaîne à 3 canaux :
//
// 1. BREVO (recommandé, 300 emails/jour gratuits) : il suffit de vérifier
//    UNE adresse d'expédition (clic sur un lien de confirmation) — AUCUN
//    domaine à posséder. Ensuite on écrit à tout le monde.
// 2. RESEND : idéal si un domaine est vérifié un jour (EMAIL_FROM).
//    En mode test sans domaine, Resend n'accepte que le compte propriétaire.
// 3. FREEBUFF : dernier recours, limité aux adresses autorisées.
//
// Envoi UN email par destinataire : un refus n'annule jamais les autres.
import { Resend } from "resend";
import axios from "axios";
import { action } from "./_generated/server";
import { v } from "convex/values";

export type EmailContent = {
  subject: string;
  html: string;
  /** Le vrai code (ex. code de vérification à 6 chiffres). Le fallback
   *  Freebuff — dont le template est en anglais — n'affiche que ce champ :
   *  sans lui, le destinataire recevrait le sujet au lieu du code. */
  otp?: string;
};

const FREEBUFF_EMAIL_KEY = "fb_email_2crN1hqIArZP2bEfvjp5Qik4";

/** Expéditeur Resend (si un domaine est vérifié un jour) :
 *  « onboarding@resend.dev » tant que EMAIL_FROM n'est pas défini. */
function fromAddress(): string {
  return process.env.EMAIL_FROM || "Classheure <onboarding@resend.dev>";
}

/** Adresse d'expédition Brevo : doit être VÉRIFIÉE dans l'espace Brevo
 *  (Senders & IP → Senders). Par défaut : l'adresse du compte. */
function brevoSender(): string {
  return process.env.BREVO_SENDER_EMAIL || "seressy02@gmail.com";
}

/** Canal 1 : Brevo — marche sans domaine une fois l'adresse d'expédition
 *  confirmée. Retourne "brevo" si l'API a accepté, "" sinon. */
async function sendViaBrevo(
  to: string,
  content: EmailContent,
  tag: string,
): Promise<string> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return "";
  try {
    const res = await axios.post(
      "https://api.brevo.com/v3/smtp/email",
      {
        sender: { name: "Classheure", email: brevoSender() },
        to: [{ email: to }],
        subject: content.subject,
        htmlContent: content.html,
      },
      {
        headers: {
          "api-key": apiKey,
          "content-type": "application/json",
          accept: "application/json",
        },
        validateStatus: () => true,
      },
    );
    if (res.status < 400) return "brevo";
    console.warn(
      `[${tag}] Brevo a refusé ${to} : HTTP ${res.status}, canal suivant.`,
      typeof res.data === "object" ? JSON.stringify(res.data).slice(0, 200) : res.data,
    );
    return "";
  } catch (err) {
    console.warn(`[${tag}] Brevo a échoué pour ${to} :`, err);
    return "";
  }
}

let resendClient: Resend | null = null;

function getResend(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  if (!resendClient) resendClient = new Resend(apiKey);
  return resendClient;
}

/** Envoie un email à UN destinataire : Brevo → Resend → fallback Freebuff.
 *  Retourne le canal utilisé ("brevo" | "resend" | "freebuff"), "" si tout
 *  a échoué. */
export async function sendSingleEmail(
  to: string,
  content: EmailContent,
  tag: string,
): Promise<string> {
  // 1) Brevo (pas de domaine requis, 300/jour gratuits)
  const brevo = await sendViaBrevo(to, content, tag);
  if (brevo) return brevo;

  // 2) Resend (domaine vérifié = tout le monde ; sinon compte propriétaire)
  const client = getResend();
  if (client) {
    try {
      const { error } = await client.emails.send({
        from: fromAddress(),
        to: [to],
        subject: content.subject,
        html: content.html,
      });
      if (!error) return "resend";
      console.warn(
        `[${tag}] Resend a refusé ${to} : ${error.name} ${error.message}. Fallback Freebuff.`,
      );
    } catch (err) {
      console.warn(`[${tag}] Resend a échoué pour ${to} :`, err);
    }
  }

  // 3) Fallback : canal Freebuff (limité aux destinataires autorisés)
  try {
    await axios.post(
      "https://auth.freebuff.app/send_otp",
      {
        to,
        otp: content.otp || content.subject,
        appName: process.env.VLY_APP_NAME || "a freebuff.com application",
      },
      { headers: { "x-api-key": FREEBUFF_EMAIL_KEY } },
    );
    return "freebuff";
  } catch (err) {
    console.warn(`[${tag}] fallback Freebuff a échoué pour ${to} :`, err);
    return "";
  }
}

/** Envoie le même email à plusieurs destinataires, un par un.
 *  Chaque destinataire est isolé : une adresse refusée n'annule pas les autres. */
export async function sendEmailsIndividually(
  to: string[],
  content: EmailContent,
  tag: string,
): Promise<void> {
  for (const email of to) {
    await sendSingleEmail(email, content, tag);
  }
}

/** TEMPORAIRE (test) : envoie un email de test et renvoie le canal utilisé.
 *  Sera supprimée après vérification. */
export const sendTestEmail = action({
  args: { to: v.string() },
  handler: async (_ctx, { to }) => {
    const channel = await sendSingleEmail(
      to,
      {
        subject: "Classheure — test d'envoi d'email",
        html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#0b1020;color:#e6e9f5;border-radius:12px">
          <h1 style="color:#8fa5ff;font-size:18px">Classheure</h1>
          <p style="font-size:14px;line-height:1.6">✅ La chaîne d'envoi d'emails fonctionne : attendez-vous à recevoir les codes, sondages et notifications par ce canal.</p>
        </div>`,
      },
      "test",
    );
    return { channel: channel || "AUCUN (tout a échoué)" };
  },
});
