/**
 * RBAC Permission System
 *
 * Legacy: session.role ("SCHOOL_ADMIN" | "TEACHER" | "GUARDIAN")
 * New: session.customRole?.permissions (JSON array of permission codes)
 *
 * Backward-compatible: SCHOOL_ADMIN has all permissions by default.
 */

// All permission codes grouped by module
export const PERMISSION_GROUPS = {
  hr: {
    label: "SDM",
    permissions: {
      "hr.view": "Akses modul SDM",
      "employees.view": "Lihat karyawan",
      "employees.create": "Tambah karyawan",
      "employees.edit": "Edit karyawan",
      "attendance.view": "Lihat kehadiran",
      "attendance.checkin": "Catat kehadiran sendiri (check-in/check-out)",
      "attendance.override": "Override kehadiran",
      "leave.view": "Lihat pengajuan cuti",
      "leave.submit": "Ajukan cuti sendiri",
      "leave.approve": "Setujui/tolak cuti",
      "payroll.view": "Lihat penggajian",
      "payroll.create": "Buat penggajian",
      "payroll.edit": "Edit komponen gaji karyawan",
      "payroll.approve": "Setujui penggajian",
      "payroll.send_slips": "Kirim slip gaji",
    },
  },
  academic: {
    label: "Akademik",
    permissions: {
      "students.view": "Lihat siswa",
      "students.create": "Tambah siswa",
      "students.edit": "Edit siswa",
      "admissions.view": "Lihat pendaftaran",
      "admissions.edit": "Edit pendaftaran",
      "academic.view": "Lihat tahun ajaran & program",
      "academic.edit": "Edit tahun ajaran & program",
    },
  },
  finance: {
    label: "Keuangan",
    permissions: {
      "invoices.view": "Lihat tagihan",
      "invoices.create": "Buat tagihan",
      "invoices.void": "Batalkan tagihan",
      "fees.view": "Lihat biaya",
      "fees.edit": "Edit struktur biaya",
      "payments.record": "Catat pembayaran",
    },
  },
  settings: {
    label: "Pengaturan",
    permissions: {
      "settings.view": "Lihat pengaturan",
      "settings.edit": "Edit pengaturan",
      "users.view": "Lihat pengguna",
      "users.edit": "Kelola pengguna & peran",
    },
  },
  curriculum: {
    label: "Kurikulum",
    permissions: {
      "curriculum.read": "Lihat kurikulum (semester, tema, subtema, pekan)",
      "curriculum.write": "Kelola kurikulum (buat / ubah / nonaktifkan)",
    },
  },
  learning: {
    label: "Penilaian",
    permissions: {
      "assessments.read": "Lihat penilaian siswa",
      "assessments.write": "Catat penilaian siswa (pekanan + sentra)",
    },
  },
} as const;

// Flatten all permission codes
export const ALL_PERMISSIONS = Object.values(PERMISSION_GROUPS).flatMap(
  (group) => Object.keys(group.permissions)
);

// Type for permission codes
export type PermissionCode = (typeof ALL_PERMISSIONS)[number];

/**
 * Check if a session has a specific permission.
 * SUPER_ADMIN always has all permissions (owner escape hatch).
 * SCHOOL_ADMIN, TEACHER, GUARDIAN are gated by their permission array.
 * Custom roles check their permissions JSON array.
 */
export function hasPermission(
  session: { role: string; permissions?: string[] | null },
  permission: string
): boolean {
  // SUPER_ADMIN owner escape hatch — always passes regardless of array
  if (session.role === "SUPER_ADMIN") return true;

  // Check permissions array (role defaults OR custom role grants)
  if (session.permissions && Array.isArray(session.permissions)) {
    return session.permissions.includes(permission);
  }

  return false;
}

/**
 * Get all permissions for a legacy role (for seeding system roles).
 *
 * SCHOOL_ADMIN enumerates its codes explicitly (not derived via filter) so
 * future HR additions to PERMISSION_GROUPS do NOT silently leak into the
 * SCHOOL_ADMIN default set — they must be consciously added here.
 */
export function getSystemRolePermissions(role: string): string[] {
  switch (role) {
    case "SUPER_ADMIN":
      return ALL_PERMISSIONS;
    case "SCHOOL_ADMIN":
      return [
        // academic
        "students.view",
        "students.create",
        "students.edit",
        "admissions.view",
        "admissions.edit",
        "academic.view",
        "academic.edit",
        // finance
        "invoices.view",
        "invoices.create",
        "invoices.void",
        "fees.view",
        "fees.edit",
        "payments.record",
        // settings
        "settings.view",
        "settings.edit",
        "users.view",
        "users.edit",
        // curriculum — SCHOOL_ADMIN can READ but not WRITE curriculum.
        // Authoring is SUPER_ADMIN-only per design doc §3.2.
        "curriculum.read",
      ];
    case "TEACHER":
      // Self-service permissions: a TEACHER can see their own attendance
      // (`attendance.view`), clock in/out (`attendance.checkin`), and submit
      // their own leave requests (`leave.submit`). Reading admin-side leave
      // listings (`leave.view`) is NOT included — that's an admin permission.
      // `curriculum.read` lets the teacher portal surface the active semester
      // → theme → week tree they will assess against (C5+ teacher Pekanan UI).
      return [
        "attendance.view",
        "attendance.checkin",
        "leave.submit",
        "students.view",
        "curriculum.read",
        // Penilaian — TEACHER may record (walas weekly + any teacher sentra)
        // and read their own writes. Per design §3.2, scoping (walas vs
        // sentra) is enforced at the route layer, not via separate keys.
        "assessments.read",
        "assessments.write",
      ];
    case "GUARDIAN":
      return ["students.view", "invoices.view"];
    default:
      return [];
  }
}
