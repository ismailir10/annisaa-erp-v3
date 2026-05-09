// Email template — admission-rejected. Sent on REJECTED transition.
// Voice: Ibu Nur tier per .claude/standards/voice.md (warmest;
// respectful; Assalamu'alaikum greeting). Polite Indonesian copy with
// no specific reason (admin can edit Admission.notes for free-text
// override; this template intentionally generic to keep the rejection
// graceful + not over-share rationale).
//
// Plain-text only — render() returns a string body. Resend cycle wraps
// in HTML; subject + applicant name + tracking code are load-bearing.
//
// Cycle: docs/cycles/2026-05-10-p2-admission-funnel-ui-review.md (T7)

export type AdmissionRejectedData = {
  /** Public tracking code shown to the parent for status lookups. */
  trackingCode: string;
  /** Display name of the registering parent (used in greeting). */
  parentDisplayName: string;
  /** Full name of the prospective student. */
  applicantFullName: string;
  /** Tenant display name (school name) for the closing line + body. */
  tenantDisplayName: string;
};

export function subject(data: AdmissionRejectedData): string {
  return `Pendaftaran ${data.applicantFullName} di ${data.tenantDisplayName}`;
}

export function render(data: AdmissionRejectedData): string {
  return [
    `Assalamu'alaikum warahmatullahi wabarakatuh,`,
    ``,
    `Ibu/Bapak ${data.parentDisplayName},`,
    ``,
    `Terima kasih atas waktu dan kepercayaan Ibu/Bapak telah mendaftarkan ${data.applicantFullName} di ${data.tenantDisplayName}. Setelah pertimbangan yang cermat, mohon maaf kami belum dapat menerima ananda pada periode penerimaan kali ini.`,
    ``,
    `Kode pelacakan pendaftaran:`,
    `  ${data.trackingCode}`,
    ``,
    `Keputusan ini bukan penilaian terhadap kemampuan ananda — semoga Allah berikan jalan terbaik untuk pendidikan ananda di tempat lain. Kami doakan kebaikan untuk seluruh keluarga.`,
    ``,
    `Jika Ibu/Bapak ingin berdiskusi lebih lanjut, silakan menghubungi tim penerimaan kami.`,
    ``,
    `Jazakumullah khairan,`,
    `Tim Penerimaan ${data.tenantDisplayName}`,
  ].join("\n");
}
