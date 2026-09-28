// Envoi d'emails transactionnels Classheure via Resend (SDK officiel).
//
// Mode test Resend : tant que le domaine d'envoi n'est pas vérifié
// (resend.com/domains), l'API n'accepte QUE l'adresse du propriétaire du
// compte. On envoie donc UN email par destinataire : chaque refus est
// isolé et bascule individuellement sur le canal de secours Freebuff.
// Une fois le domaine vérifié (et EMAIL_FROM défini), les mêmes envois
// partent vers tout le monde via Resend, sans changer une ligne de code.
import { Resend } from "resend";
import axios from "axios";

export type EmailContent = {
  subject: string;
  html: string;
};

const FREEBUFF_EMAIL_KEY = "fb_email_2crN1hqIArZP2bEfvjp5Qik4";

/** Expéditeur : « onboarding@resend.dev » (mode test) tant que EMAIL_FROM
 *  n'est pas défini, ex. "Classheure <bonjour@votre-domaine.fr>". */
function fromAddress(): string {
  return process.env.EMAIL_FROM || "Classheure <onboarding@resend.dev>";
}

let resendClient: Resend | null = null;

function getResend(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  if (!resendClient) resendClient = new Resend(apiKey);
  return resendClient;
}

/** Envoie un email à UN destinataire : Resend puis fallback Freebuff.
 *  Retourne true si l'un des deux canaux a abouti. */
export async function sendSingleEmail(
  to: string,
  content: EmailContent,
  tag: string,
): Promise<boolean> {
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
  // Fallback : canal Freebuff (limité aux destinataires autorisés)
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
