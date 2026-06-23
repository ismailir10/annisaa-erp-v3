import { Resend } from "resend";
import { prisma } from "@/lib/db";
import { enrollmentInviteEmailHtml } from "./templates/enrollment-invite";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export type SendEnrollmentInviteParams = {
  tenantId: string;
  to: string;
  childName: string;
  parentName: string;
  formUrl: string;
};

/**
 * Send the enrollment-form invitation email via Resend. Best-effort, mirroring
 * lib/email/admission-submitted.ts: { sent: false } when no API key (dev/e2e),
 * { sent: false, error } on Resend failure. The invite route swallows failures
 * — the application row + token already exist, so the admin can resend.
 *
 * Writes one EmailLog row per call (template "enrollment_invite"). The audit
 * insert is wrapped so a logging failure never alters the return contract.
 * NOTE: formUrl carries the secret access token — it is sent to the parent's
 * inbox but never written to EmailLog or console.
 */
export async function sendEnrollmentInviteEmail(
  params: SendEnrollmentInviteParams,
): Promise<{ sent: boolean; error?: string }> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://talib.annisaasekolahku.com";

  const html = enrollmentInviteEmailHtml({
    childName: params.childName,
    parentName: params.parentName,
    formUrl: params.formUrl,
    appUrl,
  });

  const subject = `Lengkapi formulir pendaftaran ananda — Talib`;

  const logAudit = async (status: "SENT" | "FAILED", error: string | null) => {
    try {
      await prisma.emailLog.create({
        data: {
          tenantId: params.tenantId,
          to: params.to,
          subject,
          template: "enrollment_invite",
          status,
          error,
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      console.error(`[EMAIL AUDIT] Failed to write EmailLog for ${params.to}: ${msg}`);
    }
  };

  if (!resend) {
    console.info(`[EMAIL SIMULATED] To: ${params.to} | Subject: ${subject}`);
    await logAudit("SENT", null);
    return { sent: false };
  }

  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) {
    console.error("[EMAIL] RESEND_FROM_EMAIL not set — dropping enrollment invite");
    await logAudit("FAILED", "RESEND_FROM_EMAIL not configured");
    return { sent: false, error: "RESEND_FROM_EMAIL not configured" };
  }

  try {
    const { error } = await resend.emails.send({ from, to: params.to, subject, html });
    if (error) {
      console.error(`[EMAIL ERROR] To: ${params.to}`, error);
      await logAudit("FAILED", error.message);
      return { sent: false, error: error.message };
    }
    await logAudit("SENT", null);
    return { sent: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error(`[EMAIL EXCEPTION] To: ${params.to}`, msg);
    await logAudit("FAILED", msg);
    return { sent: false, error: msg };
  }
}
