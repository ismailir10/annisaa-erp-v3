// Guardian entity registry (consumer of the scaffold engine `EntityDef<T>`
// contract). Per cycle spec §5.10 + assumptions §3 / §6 / §7 / §8 / §10 /
// §11 / §12 + the Shared dataFetcher contract (clauses 1-8).
//
// Row-type widening (`GuardianRow`):
//   The admin INPUT schema (`guardianSchema`) intentionally omits `userId`
//   (server-set at GuardianInvitation acceptance — see schema.ts). The LIST
//   surface, however, renders an "Aktif" / "Belum" indicator computed from
//   `userId IS NOT NULL` (cycle Tasks T3 — "Cleanest correct surface").
//   `EntityDef<T>` requires `listColumns[].field: keyof T & string`, so T
//   must include `userId`. We therefore define `GuardianRow` as the input
//   shape plus the server-managed fields the row payload carries, and pass
//   the schema to the engine via a `as unknown as ZodType<GuardianRow>`
//   widening (CLAUDE.md standards table allows `unknown` casts; rules out
//   `as any`). The schema still validates the input shape correctly at the
//   form layer; list-column reads on `userId` are sound at runtime because
//   the `dataFetcher` returns full Prisma rows.
//
// PII exclusion (Shared dataFetcher contract clause 8):
//   `lib/audit/redactor.ts` PII_FIELDS["Guardian"] declares `nik` (redact)
//   and `phone` (mask:last4). Both are EXCLUDED from `listColumns`. The
//   detail-page tabs (deferred to `p2-scaffold-pages`) MAY render them via
//   consumer-layer `redact()` lookup. The dataFetcher MAY return them in
//   the row payload — the LIST RENDER PATH must not surface them.
//
// dataFetcher scope (clause 4 — adjusted at build time):
//   This cycle's dataFetcher is tenant-scoped admin-only. `SessionContext`
//   carries `{ tenantId, userId, supabaseUserId }` only — no `role`, no
//   `currentTermId` — so the dataFetcher CANNOT discriminate admin (ALL)
//   from parent (OWN_STUDENT) without extra plumbing. `policy.scopes.read`
//   continues to declare OWN_STUDENT for parent as the source of truth;
//   `p2-scaffold-pages` will add the role-aware shell + the throw-on-
//   `studentScopeUnresolved` fail-closed branch. Until then, all callers
//   are admin paths reading admin-tenant-scoped data.
//
// Cycle: docs/cycles/2026-05-06-p2-scaffold-registries.md (T3)

import * as React from "react";
import type { ZodType } from "zod";

import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import type { DataFetcher, EntityDef } from "@/lib/scaffold";

import { guardianSchema, type GuardianInput } from "./schema";

// ── Row type (widened with server-managed fields used by list/detail) ───
// Mirrors the Prisma `Guardian` model subset the scaffold reads. Kept
// hand-rolled (rather than `import type { Guardian }` from the generated
// client) so this module stays free of generated-client coupling for the
// edge-bundle consumers — the dataFetcher already imports `prisma` for the
// runtime path; the type surface stays decoupled.

export type GuardianRow = GuardianInput & {
  id: string;
  userId: string | null;
  createdAt: Date;
  updatedAt: Date;
  /**
   * Pending-invitation count from the dataFetcher's `_count.guardianInvitations`
   * include (filtered to `status: 'PENDING'`). Powers the `hasInvitation`
   * list-column indicator (admission_officer workflow signal — guardians
   * invited but not yet portal-active per spec-time review M1).
   */
  _count: { guardianInvitations: number };
};

// ── dataFetcher ─────────────────────────────────────────────────
// Shared dataFetcher contract clauses 1-8 — admin-only tenant-scope this
// cycle (clause 4 deferred to `p2-scaffold-pages`).

const dataFetcher: DataFetcher<GuardianRow> = async (params) => {
  // Clause 1 — session resolve.
  const session = await getSession();
  if (!session) throw new Error("UNAUTHENTICATED");

  // Clause 7 — search predicate (OR over fullName / email / nik).
  // fullName + email use case-insensitive contains; nik is exact contains
  // (digits only — case folding is a no-op).
  const search = params.search?.trim();
  const searchPredicate = search
    ? {
        OR: [
          { fullName: { contains: search, mode: "insensitive" as const } },
          { email: { contains: search, mode: "insensitive" as const } },
          { nik: { contains: search } },
        ],
      }
    : {};

  // Filter predicates per cycle assumption §8.
  // hasUser: BOOLEAN — true → userId IS NOT NULL; false → userId IS NULL.
  // hasInvitation: BOOLEAN — true → at least one PENDING GuardianInvitation;
  //   false → no PENDING GuardianInvitation.
  const filterPredicates: Record<string, unknown> = {};
  const hasUser = params.filters.hasUser;
  if (typeof hasUser === "boolean") {
    filterPredicates.userId = hasUser ? { not: null } : null;
  }
  const hasInvitation = params.filters.hasInvitation;
  if (typeof hasInvitation === "boolean") {
    filterPredicates.guardianInvitations = hasInvitation
      ? { some: { status: "PENDING" } }
      : { none: { status: "PENDING" } };
  }

  // Clauses 2-3 — tenant filter + soft-delete filter.
  const where = {
    tenantId: session.tenantId,
    deletedAt: null,
    ...searchPredicate,
    ...filterPredicates,
  };

  // Clause 5 — sort handling (default fullName asc).
  const orderBy = params.sort
    ? { [params.sort.field]: params.sort.dir }
    : { fullName: "asc" as const };

  // Clause 6 — pagination + parallel count. `_count.guardianInvitations`
  // narrowed to `status: 'PENDING'` powers the list-column "Diundang" /
  // "Belum" indicator (M1 — admission_officer workflow signal).
  const [rows, total] = await Promise.all([
    prisma.guardian.findMany({
      where,
      take: params.pageSize,
      skip: (params.page - 1) * params.pageSize,
      orderBy,
      include: {
        _count: {
          select: {
            guardianInvitations: { where: { status: "PENDING" } },
          },
        },
      },
    }),
    prisma.guardian.count({ where }),
  ]);

  return { rows: rows as unknown as ReadonlyArray<GuardianRow>, total };
};

// ── EntityDef instance ──────────────────────────────────────────

const guardianEntity: EntityDef<GuardianRow> = {
  key: "guardian",
  label: "Wali",
  labelSingular: "Wali",
  icon: "UserCircle",
  // Schema is widened to ZodType<GuardianRow> via `unknown` — see header
  // note. The schema's runtime validation surface is unchanged: it accepts
  // the admin INPUT shape (no userId / id / timestamps) at form submission.
  schema: guardianSchema as unknown as ZodType<GuardianRow>,
  resource: "Guardian",
  searchFields: ["fullName", "email", "nik"] as const,
  listColumns: [
    {
      field: "fullName",
      label: "Nama Lengkap",
      render: { kind: "TEXT" },
      sortable: true,
    },
    {
      field: "email",
      label: "Surel",
      render: { kind: "EMAIL" },
    },
    {
      // PII columns (`nik`, `phone`) excluded per Shared dataFetcher
      // contract clause 8. `userId` is NOT a PII field — it is rendered
      // here as a TEXT-formatted "Aktif" / "Belum" indicator computed
      // from `userId IS NOT NULL`. The raw value is never displayed.
      field: "userId",
      label: "Akun Portal",
      render: { kind: "TEXT" },
      format: (row) => (row.userId ? "Aktif" : "Belum"),
    },
    {
      // hasInvitation indicator (per spec-time review M1 + cycle Tasks T3
      // listColumns spec). Reads from the dataFetcher's `_count.guardianInvitations`
      // include (narrowed to `status: 'PENDING'`). Anchor field `_count`
      // satisfies `EntityDef.listColumns[].field: keyof GuardianRow & string`;
      // the actual display string is computed via `format`.
      field: "_count",
      label: "Undangan",
      render: { kind: "TEXT" },
      format: (row) =>
        row._count.guardianInvitations > 0 ? "Diundang" : "Belum",
    },
  ],
  filters: [
    {
      key: "hasUser",
      label: "Akun Portal",
      kind: "BOOLEAN",
    },
    {
      key: "hasInvitation",
      label: "Undangan",
      kind: "BOOLEAN",
    },
    {
      key: "search",
      label: "Cari",
      kind: "SEARCH",
    },
  ],
  views: [
    {
      key: "default",
      label: "Semua",
      filters: {},
    },
  ],
  formSections: [
    {
      key: "identitas",
      label: "Identitas",
      fields: [
        {
          key: "fullName",
          def: { kind: "TEXT", placeholder: "Nama lengkap wali", maxLength: 255 },
          label: "Nama Lengkap",
          required: true,
        },
        {
          key: "nik",
          def: { kind: "TEXT", placeholder: "16 digit NIK", maxLength: 16 },
          label: "NIK",
        },
      ],
    },
    {
      key: "kontak",
      label: "Kontak",
      fields: [
        {
          key: "email",
          def: { kind: "EMAIL" },
          label: "Surel",
        },
        {
          key: "phone",
          def: { kind: "PHONE" },
          label: "Nomor HP",
        },
      ],
    },
  ],
  detailTabs: [
    {
      key: "ringkasan",
      label: "Ringkasan",
      render: () => React.createElement("div", null, "(deferred)"),
    },
    {
      key: "anak",
      label: "Anak",
      render: () => React.createElement("div", null, "(deferred)"),
    },
    {
      key: "riwayat",
      label: "Riwayat",
      render: () => React.createElement("div", null, "(deferred)"),
    },
    {
      key: "aktivitas",
      label: "Aktivitas",
      render: () => React.createElement("div", null, "(deferred)"),
    },
  ],
  detailActions: [],
  dataFetcher,
};

export default guardianEntity;
