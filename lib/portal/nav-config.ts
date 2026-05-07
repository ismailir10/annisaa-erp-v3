// Per-portal IA registry per foundation §10A.1.
//
// Single source of truth for sidebar navigation across the three portals.
// Per foundation §10A backend-English / labels-Indonesian rule: the route
// slugs are Indonesian-kebab (`siswa`, `wali`, `keluarga`) matching the
// existing admin route tree at `app/admin/akademik/{siswa,wali,keluarga}`.
//
// Labels are hard-coded INLINE here (not imported from `lib/entities`)
// because this module is consumed by `components/portal/sidebar.tsx` which
// is `"use client"` — importing the entity barrel pulls `getSession` /
// `prisma` (server-only via `next/headers`) into the client bundle and
// fails Turbopack's RSC boundary check.
//
// Drift coverage scope (per spec-time review T2-#1): the Akademik group's
// 3 items (Siswa / Wali / Keluarga) have entity-registry counterparts —
// `nav-config.test.ts` asserts label equality with `<entity>.label` and
// fails CI on drift. The 10 stub items across Operasi / Keuangan /
// Identitas / Sistem groups + the 8 teacher/parent items have NO entity
// registry counterpart today (they are placeholders for future cycles)
// and thus are NOT covered by the drift guard. When a future cycle wires
// a scaffold registry behind a stub item, that cycle MUST extend the
// drift test to cover the new label-equality pair.
//
// Cycle: docs/cycles/2026-05-08-p2-portal-shell-sidebar.md (T1)

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
      // NOTE — Akademik labels duplicated from `lib/entities/<name>/entity.ts`
      // per the module-doc rationale (client-bundle isolation). Drift
      // between these strings and `<entity>.label` caught by
      // `nav-config.test.ts` (Akademik group only — see module doc for
      // out-of-scope items).
      {
        key: "siswa",
        label: "Siswa",
        href: "/admin/akademik/siswa",
        icon: "Users",
      },
      {
        key: "wali",
        label: "Wali",
        href: "/admin/akademik/wali",
        icon: "UserCircle",
      },
      {
        key: "keluarga",
        label: "Keluarga",
        href: "/admin/akademik/keluarga",
        icon: "Home",
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
