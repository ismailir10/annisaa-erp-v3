/**
 * Admission-submitted confirmation email — transactional, Bu Sari voice.
 * Pure HTML string; no MJML build step (matches the existing salary-slip
 * template shape under lib/email/templates/).
 *
 * Design constraints:
 *   - Indonesian copy, warm Islamic courtesy register
 *     (per .claude/standards/voice.md Bu Sari persona).
 *   - NO links — transactional confirmation, not a CTA email.
 *   - NO tracking pixels, NO unsubscribe footer (not marketing).
 *   - Inline styles only (Gmail / Outlook compatibility).
 *   - Brand chrome reuses the salary-slip template's palette
 *     (#0C5C3F primary green; #f4f4f4 page background).
 */

export type AdmissionSubmittedEmailParams = {
  childName: string;
  parentName: string;
  appUrl?: string;
};

import { escapeHtml } from "../escape";

export function admissionSubmittedEmailHtml({
  childName,
  parentName,
  appUrl,
}: AdmissionSubmittedEmailParams): string {
  const safeChild = escapeHtml(childName);
  const safeParent = escapeHtml(parentName);
  const safeAppUrl = appUrl ? escapeHtml(appUrl) : "";

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Pendaftaran ananda diterima — Talib</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f4;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
          <tr>
            <td style="background:#0C5C3F;padding:24px 32px;color:#ffffff;">
              <div style="font-size:14px;letter-spacing:0.04em;text-transform:uppercase;opacity:0.75;">Talib · An Nisaa' Sekolahku</div>
              <h1 style="margin:8px 0 0;font-size:22px;font-weight:600;line-height:1.3;">Pendaftaran ananda tercatat</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;font-size:15px;line-height:1.65;">
              <p style="margin:0 0 16px;">Assalamu'alaikum warahmatullahi wabarakatuh,</p>
              <p style="margin:0 0 16px;">Bapak/Ibu <strong>${safeParent}</strong>, terima kasih telah mendaftarkan ananda <strong>${safeChild}</strong> di Talib oleh An Nisaa' Sekolahku.</p>
              <p style="margin:0 0 16px;">Insya Allah tim kami akan menghubungi Bapak/Ibu dalam <strong>1–3 hari kerja</strong> untuk menjadwalkan kunjungan dan memberikan informasi lanjutan tentang program yang sesuai.</p>
              <p style="margin:0 0 16px;">Mohon menunggu konfirmasi dari kami. Apabila Bapak/Ibu memiliki pertanyaan mendesak, silakan menghubungi kantor sekolah secara langsung.</p>
              <p style="margin:24px 0 0;">Wassalamu'alaikum warahmatullahi wabarakatuh,<br/><strong>Tim Penerimaan Talib</strong></p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 24px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;line-height:1.5;">
              Email ini adalah konfirmasi otomatis pendaftaran. Jangan dibalas — tim kami akan menghubungi Bapak/Ibu langsung melalui kontak yang telah didaftarkan.${safeAppUrl ? `<br/>${safeAppUrl}` : ""}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
