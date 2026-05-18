import { Resend } from "resend";
import { prisma } from "@/lib/db";
import { admissionSubmittedEmailHtml } from "./templates/admission-submitted";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export type SendAdmissionParams = {
  tenantId: string;
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
 * Writes one EmailLog row per call so admission send outcomes are auditable
 * in the same surface as salary-slip sends. The audit-log insert is wrapped
 * in its own try/catch — a logging failure must never alter the return
 * contract the route handler depends on. Status mapping:
 *   - simulated (no API key)        → SENT  / null  (dev/e2e — don't pollute audit with synthetic FAILEDs)
 *   - missing RESEND_FROM_EMAIL     → FAILED / "RESEND_FROM_EMAIL not configured"
 *   - resend returned `error`       → FAILED / error.message
 *   - resend threw                  → FAILED / exception message
 *   - resend ok                     → SENT  / null
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

  const logAudit = async (status: "SENT" | "FAILED", error: string | null) => {
    try {
      await prisma.emailLog.create({
        data: {
          tenantId: params.tenantId,
          to: params.to,
          subject,
          template: "admission_submitted",
          status,
          error,
        },
      });
    } catch (e) {
      // Audit-log failure must not change the function's return contract.
      const msg = e instanceof Error ? e.message : "Unknown error";
      console.error(`[EMAIL AUDIT] Failed to write EmailLog for ${params.to}: ${msg}`);
    }
  };

  if (!resend) {
    console.info(`[EMAIL SIMULATED] To: ${params.to} | Subject: ${subject}`);
    await logAudit("SENT", null);
    return { sent: false };
  }

  // Explicit env guard before the send call — makes a missing-config
  // failure mode visible in logs instead of burying it in an exception
  // trace from inside the resend.emails.send arg evaluation. Cycle 1.1
  // code-review #2 follow-up.
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) {
    console.error(
      "[EMAIL] RESEND_FROM_EMAIL not set — dropping admission-submitted confirmation",
    );
    await logAudit("FAILED", "RESEND_FROM_EMAIL not configured");
    return { sent: false, error: "RESEND_FROM_EMAIL not configured" };
  }

  try {
    const { error } = await resend.emails.send({
      from,
      to: params.to,
      subject,
      html,
    });

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
