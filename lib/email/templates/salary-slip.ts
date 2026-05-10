import { escapeHtml } from "../escape";

// NOTE: appUrl must remain env-controlled (NEXT_PUBLIC_APP_URL); never pass DB-sourced URLs here without escaping.

/**
 * Branded HTML email template for salary slip delivery.
 * Talib by An Nisaa' Sekolahku branding.
 *
 * Shell aligned with `lib/supabase/email-templates/*.html` — any visual
 * change here MUST be mirrored across all 5 Supabase Auth templates so
 * every Talib email feels like one product. See
 * `docs/runbooks/supabase-email-templates.md` for token table + rationale.
 *
 * User-controlled strings (employeeName, period) are HTML-escaped to
 * prevent script/markup injection from DB-stored values.
 */
export function salarySlipEmailHtml({
  employeeName,
  period,
  appUrl,
}: {
  employeeName: string;
  period: string;
  appUrl: string;
}): string {
  const safeName = escapeHtml(employeeName);
  const safePeriod = escapeHtml(period);
  return `
<!DOCTYPE html>
<html lang="id">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#F7FAFA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;margin:0 auto;padding:32px 16px;">
    <tr><td>
      <!-- Header card -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="background-color:#FFFFFF;border-radius:12px 12px 0 0;border:1px solid #E5E2DE;border-bottom:3px solid #5DB4B8;">
        <tr>
          <td align="center" bgcolor="#FFFFFF" style="padding:24px 28px;background-color:#FFFFFF;">
            <img src="${appUrl}/logo.png" alt="Talib — An Nisaa' Sekolahku" width="48" height="48" style="display:block;border-radius:12px;margin:0 auto 8px auto;" />
            <h1 style="margin:0;color:#1A2E2F;font-size:20px;font-weight:700;letter-spacing:-0.01em;">
              Talib
            </h1>
            <p style="margin:2px 0 0 0;color:#57534E;font-size:12px;">
              by An Nisaa' Sekolahku
            </p>
          </td>
        </tr>
      </table>

      <!-- Body card -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="background-color:#FFFFFF;border:1px solid #E5E2DE;border-top:none;border-radius:0 0 12px 12px;">
        <tr>
          <td bgcolor="#FFFFFF" style="padding:28px;background-color:#FFFFFF;">

            <p style="margin:0 0 20px 0;color:#1A2E2F;font-size:15px;">
              Assalamu'alaikum, <strong>${safeName}</strong>
            </p>

            <p style="margin:0 0 24px 0;color:#57534E;font-size:14px;line-height:1.6;">
              Slip gaji Anda untuk periode <strong>${safePeriod}</strong> telah tersedia. Silakan unduh slip gaji dalam format PDF melalui tautan di bawah ini.
            </p>

            <!-- CTA: bulletproof button (Outlook VML + standard anchor fallback) -->
            <div style="text-align:center;margin:0 0 24px 0;">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${appUrl}/teacher/slips" style="height:44px;v-text-anchor:middle;width:240px;" arcsize="18%" stroke="f" fillcolor="#5DB4B8">
                <w:anchorlock/>
                <center style="color:#FFFFFF;font-family:sans-serif;font-size:14px;font-weight:bold;">Lihat &amp; Unduh Slip Gaji</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-- -->
              <a href="${appUrl}/teacher/slips" style="display:inline-block;background:#5DB4B8;color:#FFFFFF;text-decoration:none;padding:12px 32px;border-radius:8px;font-size:14px;font-weight:600;mso-hide:all;">
                Lihat &amp; Unduh Slip Gaji
              </a>
              <!--<![endif]-->
            </div>

            <p style="margin:0 0 20px 0;color:#57534E;font-size:13px;line-height:1.5;">
              Slip gaji lengkap dalam format PDF juga terlampir pada email ini.
            </p>

            <p style="margin:0 0 20px 0;color:#57534E;font-size:13px;line-height:1.5;">
              Butuh bantuan? Hubungi <a href="mailto:support@annisaasekolahku.com" style="color:#5DB4B8;text-decoration:none;">support@annisaasekolahku.com</a>.
            </p>

            <hr style="border:none;border-top:1px solid #E5E2DE;margin:0 0 20px 0;">

            <p style="margin:0;color:#6B6B7A;font-size:11px;line-height:1.5;">
              Dokumen resmi &mdash; An Nisaa' Sekolahku<br>
              Taman Aster, Bekasi &middot; Metland Cibitung<br>
              Dikirim otomatis oleh Talib &middot; talib.annisaasekolahku.com
            </p>

          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();
}
