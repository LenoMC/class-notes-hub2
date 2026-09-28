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

export type EmailContent = {
  subject: string;
  html: string;
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
 *  confirmée. Retourne false si pas de clé ou si l'API refuse. */
async function sendViaBrevo(
  to: string,
  content: EmailContent,
  tag: string,
): Promise<boolean> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return false;
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
    if (res.status < 400) return true;
    console.warn(
      `[${tag}] Brevo a refusé ${to} : HTTP ${res.status}, canal suivant.`,
      typeof res.data === "object" ? JSON.stringify(res.data).slice(0, 200) : res.data,
    );
    return false;
  } catch (err) {
    console.warn(`[${tag}] Brevo a échoué pour ${to} :`, err);
    return false;
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
 *  Retourne true si l'un des canaux a abouti. */
export async function sendSingleEmail(
  to: string,
  content: EmailContent,
  tag: string,
): Promise<boolean> {
  // 1) Brevo (pas de domaine requis, 300/jour gratuits)
  if (await sendViaBrevo(to, content, tag)) return true;

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
      if (!error) return true;
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
        otp: content.subject,
        appName: process.env.VLY_APP_NAME || "a freebuff.com application",
      },
      { headers: { "x-api-key": FREEBUFF_EMAIL_KEY } },
    );
    return true;
  } catch (err) {
    console.warn(`[${tag}] fallback Freebuff a échoué pour ${to} :`, err);
    return false;
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
