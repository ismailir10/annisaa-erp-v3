/**
 * Branded HTML email template for salary slip delivery.
 * Uses An Nisaa' brand colors: teal #5DB4B8, dark #1A2E2F
 * Inline styles for email client compatibility.
 */
export function salarySlipEmailHtml({
  employeeName,
  period,
  appUrl,
}: {
  employeeName: string;
  period: string;
  netPay?: string; // kept for backward compat, no longer displayed
  appUrl: string;
}): string {
  return `
<!DOCTYPE html>
<html lang="id">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#F7FAFA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;padding:32px 16px;">
    <tr><td>
      <!-- Header (light) -->
      <div style="background:#FFFFFF;border-radius:12px 12px 0 0;padding:24px 28px;text-align:center;border:1px solid #E5E2DE;border-bottom:3px solid #5DB4B8;">
        <img src="${appUrl}/logo.png" alt="An Nisaa'" width="48" height="48" style="border-radius:12px;margin-bottom:8px;" />
        <h1 style="margin:0;color:#1A2E2F;font-size:18px;font-weight:700;letter-spacing:0.5px;">
          An Nisaa' Sekolahku
        </h1>
        <p style="margin:4px 0 0;color:#57534E;font-size:12px;">
          Pendidikan Anak Usia Dini Islam Terpadu
        </p>
      </div>

      <!-- Body -->
      <div style="background:#FFFFFF;padding:28px;border:1px solid #E5E2DE;border-top:none;border-radius:0 0 12px 12px;">

        <p style="margin:0 0 20px;color:#1A2E2F;font-size:15px;">
          Assalamu'alaikum, <strong>${employeeName}</strong>
        </p>

        <p style="margin:0 0 20px;color:#57534E;font-size:14px;line-height:1.6;">
          Slip gaji Anda untuk periode <strong>${period}</strong> telah tersedia. Silakan unduh slip gaji dalam format PDF melalui tautan di bawah ini.
        </p>

        <!-- CTA Button -->
        <div style="text-align:center;margin:0 0 24px;">
          <a href="${appUrl}/teacher/slips" style="display:inline-block;background:#5DB4B8;color:#FFFFFF;text-decoration:none;padding:12px 32px;border-radius:8px;font-size:14px;font-weight:600;">
            Lihat &amp; Unduh Slip Gaji
          </a>
        </div>

        <p style="margin:0 0 8px;color:#57534E;font-size:13px;line-height:1.5;">
          Slip gaji lengkap dalam format PDF juga terlampir pada email ini.
        </p>

        <hr style="border:none;border-top:1px solid #E5E2DE;margin:20px 0;">

        <p style="margin:0;color:#9B9BB0;font-size:11px;line-height:1.5;">
          Dokumen resmi — An Nisaa' Sekolahku<br>
          Taman Aster, Bekasi · Metland Cibitung<br>
          Email ini dikirim secara otomatis oleh sistem penggajian.
        </p>
      </div>
    </td></tr>
  </table>
</body>
</html>`.trim();
}
