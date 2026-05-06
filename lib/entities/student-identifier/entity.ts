// StudentIdentifier — `EntityDef` instance per spec §5.10.
//
// Cycle: docs/cycles/2026-05-06-p2-scaffold-registries.md (T5)
//
// dataFetcher follows the cycle's "Shared dataFetcher contract" — admin
// tenant-scoped only this cycle (clauses 1, 2, 3, 5, 6, 7). Clause 4
// (OWN_STUDENT fail-closed branch) is DEFERRED to `p2-scaffold-pages`
// because `SessionContext` does not yet carry `role` / `currentTermId` —
// the dataFetcher cannot discriminate admin (ALL) from parent (OWN_STUDENT)
// scopes. The policy still declares scopes as the source of truth; until
// the page-layer wrapper lands, all callers are admin paths and the tenant
// filter is sufficient.
//
// Default sort: `issuedAt desc` (most recent identifiers first; aligns with
// Cycle Tasks T5 default-sort convention).
//
// PII column note (per cycle's Shared dataFetcher contract clause 8):
// `StudentIdentifier` carries no `/// @PII` schema annotations. `value`
// holds the NIS/NISN string itself, NOT marked PII per `lib/audit/redactor.ts`
// `PII_FIELDS`. Safe for list surface — no exclusion required here.
//
// Detail tabs render placeholders this cycle per Assumption §10. Real tab
// content lands in `p2-scaffold-pages`. StudentIdentifier detail is rarely
// accessed standalone — it is most often viewed via Student detail-page tabs.

import * as React from "react";
import type { ZodType } from "zod";

import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import type { DataFetcher, EntityDef } from "@/lib/scaffold";
import type { StudentIdentifier } from "@/lib/generated/prisma/client";
import { studentIdentifierSchema } from "./schema";

const KIND_OPTIONS = [
  { value: "NIS", label: "NIS" },
  { value: "NISN", label: "NISN" },
  { value: "PREVIOUS_SCHOOL", label: "Sekolah Sebelumnya" },
] as const;

const dataFetcher: DataFetcher<StudentIdentifier> = async (params) => {
  // Clause 1 — Session resolve (engine signature accepts no session arg).
  const session = await getSession();
  if (!session) throw new Error("UNAUTHENTICATED");

  // Clause 7 — Search predicate over `value` (case-insensitive `contains`).
  const searchPredicate =
    params.search && params.search.length > 0
      ? { value: { contains: params.search, mode: "insensitive" as const } }
      : {};

  // Filter predicates per cycle Assumption §8: `kind` (SELECT) + `isPrimary` (BOOLEAN).
  const filterPredicates: Record<string, unknown> = {};
  const kindFilter = params.filters.kind;
  if (typeof kindFilter === "string" && kindFilter.length > 0) {
    filterPredicates.kind = kindFilter;
  }
  const isPrimaryFilter = params.filters.isPrimary;
  if (typeof isPrimaryFilter === "boolean") {
    filterPredicates.isPrimary = isPrimaryFilter;
  }

  // Clause 2 — tenant filter. Clause 3 — soft-delete (softDelete=true).
  const where = {
    tenantId: session.tenantId,
    deletedAt: null,
    ...searchPredicate,
    ...filterPredicates,
  };

  // Clause 5 — sort handling: explicit `params.sort` wins; default `issuedAt desc`.
  const orderBy = params.sort
    ? { [params.sort.field]: params.sort.dir }
    : { issuedAt: "desc" as const };

  // Clause 6 — paginate + count in parallel.
  const [rows, total] = await Promise.all([
    prisma.studentIdentifier.findMany({
      where,
      take: params.pageSize,
      skip: (params.page - 1) * params.pageSize,
      orderBy,
    }),
    prisma.studentIdentifier.count({ where }),
  ]);

  return {
    rows: rows as ReadonlyArray<StudentIdentifier>,
    total,
  };
};

export const studentIdentifierEntity: EntityDef<StudentIdentifier> = {
  key: "student-identifier",
  label: "Identitas Siswa",
  labelSingular: "Identitas Siswa",
  icon: "BadgeCheck",
  // Schema validates admin INPUT only — narrower than the Prisma row type.
  // Cast to the engine's `ZodType<StudentIdentifier>` slot; runtime
  // `schema.parse(input)` calls remain unaffected.
  schema: studentIdentifierSchema as unknown as ZodType<StudentIdentifier>,
  resource: "StudentIdentifier",
  searchFields: ["value"] as const,
  listColumns: [
    {
      field: "kind",
      label: "Jenis",
      render: { kind: "ENUM", enumName: "StudentIdentifierKind", options: KIND_OPTIONS },
      sortable: true,
    },
    {
      field: "value",
      label: "Nilai",
      render: { kind: "TEXT" },
    },
    {
      field: "isPrimary",
      label: "Primer",
      render: { kind: "BOOLEAN", trueLabel: "Primer", falseLabel: "—" },
    },
    {
      field: "issuedAt",
      label: "Diterbitkan",
      render: { kind: "DATE" },
      sortable: true,
    },
  ],
  filters: [
    {
      key: "kind",
      label: "Jenis",
      kind: "SELECT",
      options: KIND_OPTIONS,
    },
    {
      key: "isPrimary",
      label: "Primer",
      kind: "BOOLEAN",
      options: [
        { value: "true", label: "Primer" },
        { value: "false", label: "Bukan" },
      ],
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
          key: "studentId",
          def: { kind: "RELATION", resource: "Student", labelField: "fullName" },
          label: "Siswa",
          required: true,
        },
        {
          key: "kind",
          def: { kind: "ENUM", enumName: "StudentIdentifierKind", options: KIND_OPTIONS },
          label: "Jenis",
          required: true,
        },
        {
          key: "value",
          def: { kind: "TEXT", maxLength: 100 },
          label: "Nilai",
          required: true,
        },
        {
          key: "isPrimary",
          def: { kind: "BOOLEAN", trueLabel: "Primer", falseLabel: "Bukan" },
          label: "Primer",
        },
        {
          key: "issuedAt",
          def: { kind: "DATE" },
          label: "Tanggal Terbit",
        },
        {
          key: "notes",
          def: { kind: "TEXTAREA", maxLength: 2000, rows: 3 },
          label: "Catatan",
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

export default studentIdentifierEntity;
