// Email template — admission-accepted. Sent on OFFER_EXTENDED → ACCEPTED
// transition (after the side-effect bundle commits Household/Student/Guardian
// rows). Voice: Ibu Nur tier per .claude/standards/voice.md (warmest;
// child-framed; Assalamu'alaikum greeting; respectful Pak/Bu honorific).
//
// Plain-text only — render() returns a string body. The Resend integration
// cycle wraps it in HTML; subject + tracking code + student name are the
// load-bearing data points until then.
//
// Cycle: docs/cycles/2026-05-10-p2-admission-funnel-ui-review.md (T7)

export type AdmissionAcceptedData = {
  /** Public tracking code shown to the parent for status lookups. */
  trackingCode: string;
  /** Display name of the registering parent (used in greeting). */
  parentDisplayName: string;
  /** Full name of the newly-enrolled student. */
  studentFullName: string;
  /** Tenant display name (school name) for the closing line + body. */
  tenantDisplayName: string;
};

export function subject(data: AdmissionAcceptedData): string {
  return `${data.studentFullName} diterima di ${data.tenantDisplayName} — Alhamdulillah`;
}

export function render(data: AdmissionAcceptedData): string {
  return [
    `Assalamu'alaikum warahmatullahi wabarakatuh,`,
    ``,
    `Ibu/Bapak ${data.parentDisplayName},`,
    ``,
    `Alhamdulillah, ${data.studentFullName} resmi diterima di ${data.tenantDisplayName}.`,
    `Selamat bergabung dalam keluarga besar kami — semoga Allah mudahkan setiap langkah pendidikan ananda.`,
    ``,
    `Kode pelacakan pendaftaran:`,
    `  ${data.trackingCode}`,
    ``,
    `Langkah berikutnya — InsyaAllah kami akan menghubungi Ibu/Bapak melalui email atau telepon untuk:`,
    `  • Jadwal MPLS (Masa Pengenalan Lingkungan Sekolah)`,
    `  • Pelengkapan dokumen (Akta Kelahiran, Kartu Keluarga, foto)`,
    `  • Informasi seragam + perlengkapan tahun ajaran`,
    ``,
    `Jazakumullah khairan atas kepercayaan Ibu/Bapak,`,
    `Tim Penerimaan ${data.tenantDisplayName}`,
  ].join("\n");
}
