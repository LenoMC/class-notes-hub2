// Envoi d'emails transactionnels Classheure.
//
// IMPORTANT (mode test Resend) : en mode test, Resend refuse UNE adresse non
// autorisée mais ne doit PAS empêcher l'envoi aux autres destinataires.
// On envoie donc UN email par destinataire : chaque échec est isolé et
// bascule individuellement sur le canal de secours Freebuff.
import axios from "axios";

export type EmailContent = {
  subject: string;
  html: string;
};

const FREEBUFF_EMAIL_KEY = "fb_email_2crN1hqIArZP2bEfvjp5Qik4";

/** Envoie un email à UN destinataire : Resend puis fallback Freebuff.
 *  Retourne true si l'un des deux canaux a abouti. */
export async function sendSingleEmail(
  to: string,
  content: EmailContent,
  tag: string,
): Promise<boolean> {
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      const res = await axios.post(
        "https://api.resend.com/emails",
        {
          from: "Classheure <onboarding@resend.dev>",
          to: [to],
          subject: content.subject,
          html: content.html,
        },
        {
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          validateStatus: () => true,
        },
      );
      if (res.status < 400) return true;
      console.warn(
        `[${tag}] Resend a refusé ${to} : HTTP ${res.status}, on tente le fallback.`,
        typeof res.data === "object"
          ? JSON.stringify(res.data).slice(0, 200)
          : res.data,
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
