// Per-portal IA registry per foundation §10A.1.
//
// Single source of truth for sidebar navigation across the three portals.
// Pulls entity labels from `lib/entities/index.ts` (one-way dep — entity
// modules NEVER import portal config; ESLint `import/no-cycle` catches
// regressions).
//
// Per foundation §10A backend-English / labels-Indonesian rule: the route
// slugs are Indonesian-kebab (`siswa`, `wali`, `keluarga`) matching the
// existing admin route tree at `app/admin/akademik/{siswa,wali,keluarga}`.
// Hard-coded here because EntityDef does not (yet) carry a route-slug
// field — adding one is a separate cycle's call. Labels still derive from
// the entity registry to avoid string-duplication drift.
//
// Cycle: docs/cycles/2026-05-08-p2-portal-shell-sidebar.md (T1)

import {
  studentEntity,
  guardianEntity,
  householdEntity,
} from "@/lib/entities";

export type NavItem = {
  /** Stable identifier for active-route highlight + key. */
  readonly key: string;
  /** Indonesian surface label. */
  readonly label: string;
  /** Absolute path. */
  readonly href: string;
  /** Lucide icon name (e.g. "Users"). */
  readonly icon: string;
  /** Render greyed-out + non-clickable when the destination is not yet mounted. */
  readonly disabled?: boolean;
};

export type NavGroup = {
  /** Stable identifier for keying. */
  readonly key: string;
  /** Indonesian section heading. */
  readonly label: string;
  readonly items: ReadonlyArray<NavItem>;
};

// ── Admin IA per foundation §10A.1 ───────────────────────────
// 5 groups: Akademik / Operasi / Keuangan / Identitas / Sistem.
// Stub items (`disabled: true`) for groups whose entities have not yet
// shipped scaffold registries.

const ADMIN_NAV: ReadonlyArray<NavGroup> = [
  {
    key: "akademik",
    label: "Akademik",
    items: [
      {
        key: "siswa",
        label: studentEntity.label,
        href: "/admin/akademik/siswa",
        icon: studentEntity.icon,
      },
      {
        key: "wali",
        label: guardianEntity.label,
        href: "/admin/akademik/wali",
        icon: guardianEntity.icon,
      },
      {
        key: "keluarga",
        label: householdEntity.label,
        href: "/admin/akademik/keluarga",
        icon: householdEntity.icon,
      },
    ],
  },
  {
    key: "operasi",
    label: "Operasi",
    items: [
      {
        key: "kelas",
        label: "Kelas",
        href: "/admin/operasi/kelas",
        icon: "School",
        disabled: true,
      },
      {
        key: "absensi",
        label: "Absensi",
        href: "/admin/operasi/absensi",
        icon: "ClipboardCheck",
        disabled: true,
      },
    ],
  },
  {
    key: "keuangan",
    label: "Keuangan",
    items: [
      {
        key: "tagihan",
        label: "Tagihan",
        href: "/admin/keuangan/tagihan",
        icon: "Receipt",
        disabled: true,
      },
      {
        key: "pembayaran",
        label: "Pembayaran",
        href: "/admin/keuangan/pembayaran",
        icon: "CreditCard",
        disabled: true,
      },
    ],
  },
  {
    key: "identitas",
    label: "Identitas",
    items: [
      {
        key: "pengguna",
        label: "Pengguna",
        href: "/admin/identitas/pengguna",
        icon: "UserCircle",
        disabled: true,
      },
      {
        key: "peran",
        label: "Peran",
        href: "/admin/identitas/peran",
        icon: "ShieldCheck",
        disabled: true,
      },
    ],
  },
  {
    key: "sistem",
    label: "Sistem",
    items: [
      {
        key: "pengaturan",
        label: "Pengaturan",
        href: "/admin/sistem/pengaturan",
        icon: "Settings",
        disabled: true,
      },
      {
        key: "audit",
        label: "Audit",
        href: "/admin/sistem/audit",
        icon: "FileSearch",
        disabled: true,
      },
    ],
  },
];

// ── Teacher IA per foundation §10A.1 ─────────────────────────
// Single ungrouped list: Beranda + Kelas Saya + Sentra Saya + Riwayat.

const TEACHER_NAV: ReadonlyArray<NavGroup> = [
  {
    key: "_root",
    label: "",
    items: [
      {
        key: "beranda",
        label: "Beranda",
        href: "/teacher",
        icon: "Home",
      },
      {
        key: "kelas-saya",
        label: "Kelas Saya",
        href: "/teacher/kelas",
        icon: "School",
        disabled: true,
      },
      {
        key: "sentra-saya",
        label: "Sentra Saya",
        href: "/teacher/sentra",
        icon: "Layers",
        disabled: true,
      },
      {
        key: "riwayat",
        label: "Riwayat",
        href: "/teacher/riwayat",
        icon: "History",
        disabled: true,
      },
    ],
  },
];

// ── Parent IA per foundation §10A.1 ──────────────────────────
// Single ungrouped list: Beranda + Anak Saya + Tagihan + Pengumuman.

const PARENT_NAV: ReadonlyArray<NavGroup> = [
  {
    key: "_root",
    label: "",
    items: [
      {
        key: "beranda",
        label: "Beranda",
        href: "/parent",
        icon: "Home",
      },
      {
        key: "anak-saya",
        label: "Anak Saya",
        href: "/parent/anak",
        icon: "Users",
        disabled: true,
      },
      {
        key: "tagihan",
        label: "Tagihan",
        href: "/parent/tagihan",
        icon: "Receipt",
        disabled: true,
      },
      {
        key: "pengumuman",
        label: "Pengumuman",
        href: "/parent/pengumuman",
        icon: "Megaphone",
        disabled: true,
      },
    ],
  },
];

export const NAV_BY_PORTAL: Readonly<
  Record<"admin" | "teacher" | "parent", ReadonlyArray<NavGroup>>
> = Object.freeze({
  admin: ADMIN_NAV,
  teacher: TEACHER_NAV,
  parent: PARENT_NAV,
});
