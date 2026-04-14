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
      "employees.view": "Lihat karyawan",
      "employees.create": "Tambah karyawan",
      "employees.edit": "Edit karyawan",
      "attendance.view": "Lihat kehadiran",
      "attendance.override": "Override kehadiran",
      "leave.view": "Lihat pengajuan cuti",
      "leave.approve": "Setujui/tolak cuti",
      "payroll.view": "Lihat penggajian",
      "payroll.create": "Buat penggajian",
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
} as const;

// Flatten all permission codes
export const ALL_PERMISSIONS = Object.values(PERMISSION_GROUPS).flatMap(
  (group) => Object.keys(group.permissions)
);

// Type for permission codes
export type PermissionCode = (typeof ALL_PERMISSIONS)[number];

/**
 * Check if a session has a specific permission.
 * SCHOOL_ADMIN always has all permissions (backward-compatible).
 * TEACHER and GUARDIAN have no admin permissions by default.
 * Custom roles check their permissions JSON array.
 */
export function hasPermission(
  session: { role: string; permissions?: string[] | null },
  permission: string
): boolean {
  // SCHOOL_ADMIN has all permissions
  if (session.role === "SCHOOL_ADMIN") return true;

  // Check custom role permissions if available
  if (session.permissions && Array.isArray(session.permissions)) {
    return session.permissions.includes(permission);
  }

  return false;
}

/**
 * Get all permissions for a legacy role (for seeding system roles).
 */
export function getSystemRolePermissions(role: string): string[] {
  switch (role) {
    case "SCHOOL_ADMIN":
      return ALL_PERMISSIONS;
    case "TEACHER":
      return ["attendance.view", "students.view"];
    case "GUARDIAN":
      return ["students.view", "invoices.view"];
    default:
      return [];
  }
}
