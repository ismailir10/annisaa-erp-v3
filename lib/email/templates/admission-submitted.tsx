// Email template — admission-submitted. Sent on DRAFT → SUBMITTED transition.
// Voice: Ibu Nur tier per .claude/standards/voice.md (warmest of three; child-
// framed; Assalamu'alaikum greeting; respectful Pak/Bu honorific). Plain-text
// only — render() returns a string body. The Resend integration cycle will
// wrap this string in an HTML-safe template; subject + tracking code are the
// load-bearing data points until then.
//
// Cycle: docs/cycles/2026-05-10-p2-admission-funnel-ui-public.md (T5)

export type AdmissionSubmittedData = {
  /** Public tracking code shown to the parent for status lookups. */
  trackingCode: string;
  /** Display name of the registering parent (used in greeting). */
  parentDisplayName: string;
  /** Full name of the prospective student. */
  applicantFullName: string;
  /** Tenant display name (school name) for the closing line. */
  tenantDisplayName: string;
};

export function subject(data: AdmissionSubmittedData): string {
  return `Pendaftaran ${data.applicantFullName} telah kami terima`;
}

export function render(data: AdmissionSubmittedData): string {
  return [
    `Assalamu'alaikum warahmatullahi wabarakatuh,`,
    ``,
    `Ibu/Bapak ${data.parentDisplayName},`,
    ``,
    `Terima kasih telah mendaftarkan ${data.applicantFullName} di ${data.tenantDisplayName}. Pendaftaran sudah kami terima dan sedang menunggu peninjauan tim penerimaan.`,
    ``,
    `Kode pelacakan pendaftaran:`,
    `  ${data.trackingCode}`,
    ``,
    `Mohon simpan kode ini. Kami akan menghubungi Ibu/Bapak melalui email atau telepon untuk tahap selanjutnya — InsyaAllah dalam waktu dekat.`,
    ``,
    `Jazakumullah khairan,`,
    `Tim Penerimaan ${data.tenantDisplayName}`,
  ].join("\n");
}
