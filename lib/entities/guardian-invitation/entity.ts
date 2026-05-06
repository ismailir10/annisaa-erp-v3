// GuardianInvitation — `EntityDef` instance per spec §5.10.
//
// Cycle: docs/cycles/2026-05-06-p2-scaffold-registries.md (T6)
//
// dataFetcher follows the cycle's "Shared dataFetcher contract" — admin
// tenant-scoped only this cycle (clauses 1, 2, 5, 6, 7). Clause 3
// (soft-delete filter) is INTENTIONALLY SKIPPED — `softDelete: false` per
// policy, no `deletedAt` column exists on this model. Including
// `deletedAt: null` in the WHERE clause would emit invalid SQL. Clause 4
// (OWN_STUDENT fail-closed branch) is DEFERRED to `p2-scaffold-pages`
// because `SessionContext` does not yet carry `role` / `currentTermId` —
// the dataFetcher cannot discriminate admin (ALL) from parent (OWN_STUDENT)
// scopes. The policy still declares scopes as the source of truth; until
// the page-layer wrapper lands, all callers are admin paths and the tenant
// filter is sufficient.
//
// Default sort: `createdAt desc` (most recent invitations first; aligns
// with cycle Tasks T6 default-sort convention).
//
// PII column note (per cycle's Shared dataFetcher contract clause 8):
// `GuardianInvitation` carries no `/// @PII` schema annotations — `token`
// is a server secret kept off the list surface for operational hygiene
// (no consumer renders it), but it's not redactor-tracked PII. Safe.
//
// `searchFields` is constrained by `EntityDef<T>` to `keyof T & string`,
// so we cannot list "student.fullName" directly. We list `studentId` as a
// type-level placeholder; the real search predicate inside `dataFetcher`
// routes through the composite-FK `student.fullName` include per cycle
// Tasks T6 search clause.
//
// Smart View `expired` (per cycle Assumption §8): the derived predicate
// `status='PENDING' AND expiresAt<now()` does NOT belong as a chip filter
// (the BOOLEAN convention is `field=true|false`, not a derived predicate)
// so it lives in `entity.views[]`. Server-side query reuses the `status`
// filter (`PENDING`); the `predicate` callback narrows to expired-only on
// the client per `ViewDef.predicate` contract.
//
// Detail tabs render placeholders this cycle per Assumption §10. Real tab
// content lands in `p2-scaffold-pages`.

import * as React from "react";
import type { ZodType } from "zod";

import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import type { DataFetcher, EntityDef } from "@/lib/scaffold";
import type { GuardianInvitation } from "@/lib/generated/prisma/client";
import { guardianInvitationSchema } from "./schema";

// Row type widens the Prisma `GuardianInvitation` model with the composite-FK
// `student` + `guardian` selects the dataFetcher includes. RELATION list
// columns + the Smart View `expired` predicate read from these fields, so
// they belong on the row type — narrowing to `GuardianInvitationInput` would
// drop `id`, `createdAt`, `acceptedAt`, the relation selects, and break the
// `predicate` callback's read of `row.status` / `row.expiresAt`.
export type GuardianInvitationRow = GuardianInvitation & {
  student: { fullName: string };
  guardian: { fullName: string };
};

const STATUS_OPTIONS = [
  { value: "PENDING", label: "Menunggu" },
  { value: "ACCEPTED", label: "Diterima" },
  { value: "EXPIRED", label: "Kadaluarsa" },
  { value: "REVOKED", label: "Dicabut" },
] as const;

const dataFetcher: DataFetcher<GuardianInvitationRow> = async (params) => {
  // Clause 1 — Session resolve (engine signature accepts no session arg).
  const session = await getSession();
  if (!session) throw new Error("UNAUTHENTICATED");

  // Clause 7 — Search predicate via composite-FK include (`student.fullName`)
  // per cycle Tasks T6 + Assumption §8. Trigram GIN index on Student.fullName
  // (migration 07) is correctness-correct; latency optimisation deferred.
  const searchPredicate =
    params.search && params.search.length > 0
      ? {
          student: {
            fullName: { contains: params.search, mode: "insensitive" as const },
          },
        }
      : {};

  // Filter predicates per cycle Assumption §8: `status` (SELECT). The
  // derived `expired` chip is shipped as a Smart View, not a filter.
  const filterPredicates: Record<string, unknown> = {};
  const statusFilter = params.filters.status;
  if (typeof statusFilter === "string" && statusFilter.length > 0) {
    filterPredicates.status = statusFilter;
  }

  // Clause 2 — tenant filter. Clause 3 SKIPPED — softDelete=false; no
  // `deletedAt` column exists on this model. Including `deletedAt: null`
  // would emit invalid SQL.
  const where = {
    tenantId: session.tenantId,
    ...searchPredicate,
    ...filterPredicates,
  };

  // Clause 5 — sort handling: explicit `params.sort` wins; default `createdAt desc`.
  const orderBy = params.sort
    ? { [params.sort.field]: params.sort.dir }
    : { createdAt: "desc" as const };

  // Clause 6 — paginate + count in parallel. Composite-FK include exposes
  // `student.fullName` + `guardian.fullName` for RELATION list columns; the
  // include WHERE is implicit-tenant-scoped via the FK (studentId, tenantId)
  // / (guardianId, tenantId) composite per spec §6.4 cross-tenant safety.
  const [rows, total] = await Promise.all([
    prisma.guardianInvitation.findMany({
      where,
      take: params.pageSize,
      skip: (params.page - 1) * params.pageSize,
      orderBy,
      include: {
        student: { select: { fullName: true } },
        guardian: { select: { fullName: true } },
      },
    }),
    prisma.guardianInvitation.count({ where }),
  ]);

  return {
    rows: rows as ReadonlyArray<GuardianInvitationRow>,
    total,
  };
};

export const guardianInvitationEntity: EntityDef<GuardianInvitationRow> = {
  key: "guardian-invitation",
  label: "Undangan Wali",
  labelSingular: "Undangan Wali",
  icon: "MailPlus",
  // Schema validates admin INPUT only — narrower than the Prisma row type.
  // Cast to `ZodType<GuardianInvitationRow>`; runtime `schema.parse(input)`
  // calls remain unaffected.
  schema: guardianInvitationSchema as unknown as ZodType<GuardianInvitationRow>,
  resource: "GuardianInvitation",
  // Type-level placeholder — the real search predicate inside `dataFetcher`
  // routes through the composite-FK `student.fullName` include. `EntityDef<T>`
  // restricts `searchFields` to `keyof T & string`, which excludes nested
  // relation paths.
  searchFields: ["studentId"] as const,
  listColumns: [
    {
      field: "studentId",
      label: "Siswa",
      render: { kind: "RELATION", resource: "Student", labelField: "fullName" },
    },
    {
      field: "guardianId",
      label: "Wali",
      render: { kind: "RELATION", resource: "Guardian", labelField: "fullName" },
    },
    {
      field: "status",
      label: "Status",
      render: {
        kind: "ENUM",
        enumName: "GuardianInvitationStatus",
        options: STATUS_OPTIONS,
      },
      sortable: true,
    },
    {
      field: "expiresAt",
      label: "Kadaluarsa",
      render: { kind: "DATETIME" },
      sortable: true,
    },
  ],
  filters: [
    {
      key: "status",
      label: "Status",
      kind: "SELECT",
      options: STATUS_OPTIONS,
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
    {
      key: "expired",
      label: "Kadaluarsa",
      filters: { status: "PENDING" },
      description: "Undangan PENDING yang sudah lewat tanggal kadaluarsa",
      predicate: (row) =>
        row.status === "PENDING" && new Date(row.expiresAt) < new Date(),
    },
  ],
  formSections: [
    {
      key: "identitas",
      label: "Detail Undangan",
      fields: [
        {
          key: "studentId",
          def: { kind: "RELATION", resource: "Student", labelField: "fullName" },
          label: "Siswa",
          required: true,
        },
        {
          key: "guardianId",
          def: { kind: "RELATION", resource: "Guardian", labelField: "fullName" },
          label: "Wali",
          required: true,
        },
        {
          key: "expiresAt",
          def: { kind: "DATETIME" },
          label: "Kadaluarsa",
          required: true,
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
      key: "aktivitas",
      label: "Aktivitas",
      render: () => React.createElement("div", null, "(deferred)"),
    },
  ],
  detailActions: [],
  dataFetcher,
};

// Canonical alias for scaffold-check static guard.
export const entity = guardianInvitationEntity;

export default guardianInvitationEntity;
