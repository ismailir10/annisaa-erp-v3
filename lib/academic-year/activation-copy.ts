/**
 * Confirm-dialog copy for switching the school's active academic year
 * (CORE-6). Mirrors what the server does in `PUT /api/academic-years/[id]`:
 * `demoteOtherActiveYears` turns the currently ACTIVE year into PLANNING
 * (never ARCHIVED), so that is what the admin is told.
 */
type YearLike = { id: string; name: string; status: string };

export function activationDescription(target: YearLike, years: YearLike[]): string {
  const current = years.find((y) => y.status === "ACTIVE" && y.id !== target.id);
  const parts = [
    "Ini akan menjadi tahun ajaran aktif untuk seluruh sekolah: daftar Kelas, pilihan tahun ajaran, dan pendaftaran siswa akan mengikutinya.",
  ];
  if (current) {
    parts.push(`Tahun ajaran aktif saat ini (${current.name}) akan diubah menjadi Perencanaan.`);
  }
  if (target.status === "ARCHIVED") {
    parts.push("Tahun ajaran ini sedang diarsipkan dan akan dibuka kembali.");
  }
  return parts.join(" ");
}

export function archiveDescription(target: YearLike): string {
  return target.status === "ACTIVE"
    ? "Tahun ajaran aktif ini akan diarsipkan, sehingga sekolah tidak punya tahun ajaran aktif sampai tahun lain diaktifkan. Tidak bisa dilakukan selama masih ada siswa aktif di kelasnya. Bisa diaktifkan kembali kapan saja."
    : "Tahun ajaran ini akan diarsipkan dan tidak muncul di daftar pilihan. Bisa diaktifkan kembali kapan saja.";
}
