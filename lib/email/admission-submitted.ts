import { Resend } from "resend";
import { admissionSubmittedEmailHtml } from "./templates/admission-submitted";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export type SendAdmissionParams = {
  to: string;
  childName: string;
  parentName: string;
};

/**
 * Send admission-submitted confirmation email via Resend.
 * Best-effort: returns { sent: false } when no API key (dev / e2e),
 * { sent: false, error } on Resend failure. Caller (POST /api/admission/submit)
 * swallows the failure and still returns 201 — per plan §7 q4 the user
 * submitted successfully even if downstream notification stutters.
 *
 * Mirrors the lib/email/send-slip.ts shape — module-scope Resend client,
 * console.info simulation when key absent.
 */
export async function sendAdmissionSubmittedEmail(
  params: SendAdmissionParams,
): Promise<{ sent: boolean; error?: string }> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://talib.annisaasekolahku.com";

  const html = admissionSubmittedEmailHtml({
    childName: params.childName,
    parentName: params.parentName,
    appUrl,
  });

  const subject = `Pendaftaran ananda diterima — Talib`;

  if (!resend) {
    console.info(`[EMAIL SIMULATED] To: ${params.to} | Subject: ${subject}`);
    return { sent: false };
  }

  try {
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL ??
        (() => {
          throw new Error("RESEND_FROM_EMAIL not set — configure a verified domain");
        })(),
      to: params.to,
      subject,
      html,
    });

    if (error) {
      console.error(`[EMAIL ERROR] To: ${params.to}`, error);
      return { sent: false, error: error.message };
    }

    return { sent: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error(`[EMAIL EXCEPTION] To: ${params.to}`, msg);
    return { sent: false, error: msg };
  }
}
