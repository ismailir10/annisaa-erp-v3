import { Resend } from "resend";
import { salarySlipEmailHtml } from "./templates/salary-slip";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

export type SendSlipParams = {
  to: string;
  employeeName: string;
  period: string;
  pdfBuffer: Buffer | Uint8Array;
  pdfFilename: string;
};

/**
 * Send salary slip email with PDF attachment via Resend.
 * Returns { sent: true } if delivered, { sent: false } if simulated (no API key).
 */
export async function sendSalarySlipEmail(params: SendSlipParams): Promise<{
  sent: boolean;
  error?: string;
}> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://talib.annisaasekolahku.com";

  const html = salarySlipEmailHtml({
    employeeName: params.employeeName,
    period: params.period,
    appUrl,
  });

  const subject = `Slip Gaji ${params.period} — Talib`;

  if (!resend) {
    console.info(`[EMAIL SIMULATED] To: ${params.to} | Subject: ${subject}`);
    return { sent: false };
  }

  // Explicit env guard before the send call — surface the missing-config
  // failure mode as a clean return value instead of an exception from
  // inside resend.emails.send arg evaluation. Mirrors the shape used in
  // lib/email/admission-submitted.ts.
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) {
    console.error(
      "[EMAIL] RESEND_FROM_EMAIL not set — dropping salary-slip email",
    );
    return { sent: false, error: "RESEND_FROM_EMAIL not configured" };
  }

  try {
    const { error } = await resend.emails.send({
      from,
      to: params.to,
      subject,
      html,
      attachments: [
        {
          filename: params.pdfFilename,
          content: Buffer.from(params.pdfBuffer),
        },
      ],
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
