// Student EntityDef — registry consumed by the scaffold engine's three page
// shells (List / Form / Detail). Per spec §5.1 + §5.4 (page anatomy) + §5.10
// (chip filters) + cycle Assumptions §8 (filters) + §10 (detailTab stubs) +
// §11 (Indonesian labels) + §12 (Lucide icon).
//
// `T` is the Prisma `Student` row type — the dataFetcher returns
// `prisma.student.findMany(...)` results. The included `program` relation is
// represented as a list-time-only enrichment carried alongside the bare
// `Student` shape and rendered via the `RELATION` field renderer keyed off
// `programId` per `FieldDef.RELATION.labelField`.
//
// Schema vs T mismatch (compile-time): `schema` (Zod) validates admin INPUT
// payloads — its inferred type is a partial of `Student` (no audit columns,
// no tenantId). The `EntityDef<T>` engine contract types `schema` as
// `ZodType<T>` for validation symmetry; we narrow via `unknown` cast at the
// `schema` field per CLAUDE.md no-`as any` rule. The page-layer form
// recipes consume `schema` via `schema.parse(input)` which preserves runtime
// validation regardless of the structural cast.
//
// `listColumns` MUST exclude `nik` per Shared dataFetcher contract clause 8
// + spec-time review M4 — `nik` is annotated `/// @PII redact` in
// prisma/schema.prisma and surfaces in `lib/audit/redactor.ts` PII_FIELDS.
// The List render path is the unredacted exposure surface; Detail tabs MAY
// render PII via consumer-layer redaction at the page layer (deferred to
// p2-scaffold-pages).
//
// `dataFetcher` follows Shared contract clauses 1-3 + 5-8: session resolve →
// tenant filter → soft-delete filter → sort handling → pagination → search
// → no PII in list. Clause 4 (OWN_STUDENT fail-closed branch) is DEFERRED
// to p2-scaffold-pages per cycle's adjusted clause 4 — admin tenant-scoped
// only this cycle (SessionContext currently lacks `role` + `currentTermId`).
//
// Cycle: docs/cycles/2026-05-06-p2-scaffold-registries.md (T2)

import * as React from "react";
import type { ZodType } from "zod";

import type { EntityDef } from "@/lib/scaffold";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import type { Student } from "@/lib/generated/prisma/client";

import { schema } from "./schema";

const GENDER_OPTIONS = [
  { value: "MALE", label: "Laki-laki" },
  { value: "FEMALE", label: "Perempuan" },
] as const;

export const entity: EntityDef<Student> = {
  key: "student",
  label: "Siswa",
  labelSingular: "Siswa",
  icon: "Users",
  // Cast: schema validates admin INPUT (subset of Student); EntityDef<T>
  // types `schema` as ZodType<T> for symmetry. Runtime `schema.parse()`
  // calls are unaffected by the structural cast.
  schema: schema as unknown as ZodType<Student>,
  resource: "Student",
  // `nik` excluded from `searchFields` per spec-time review N7 — listing PII
  // fields here would surface "NIK" as a search-hint label in the engine UI,
  // contradicting PII minimisation. The dataFetcher's search predicate still
  // matches against `nik` for admin lookups; predicate is independent of
  // `searchFields` (which is a UI hint only).
  searchFields: ["fullName", "nis"] as const,
  listColumns: [
    {
      field: "nis",
      label: "NIS",
      render: { kind: "TEXT" },
      sortable: true,
    },
    {
      field: "fullName",
      label: "Nama Lengkap",
      render: { kind: "TEXT" },
      sortable: true,
    },
    {
      field: "nickname",
      label: "Nama Panggilan",
      render: { kind: "TEXT" },
    },
    {
      field: "gender",
      label: "Jenis Kelamin",
      render: { kind: "ENUM", enumName: "Gender", options: GENDER_OPTIONS },
    },
    {
      // RELATION column rendered off the FK. Engine resolves the related
      // label via the dataFetcher's `include: { program: { select: { name: true } } }`.
      field: "programId",
      label: "Program",
      render: { kind: "RELATION", resource: "Program", labelField: "name" },
    },
    {
      field: "enrolledAt",
      label: "Tanggal Masuk",
      render: { kind: "DATE" },
      sortable: true,
    },
    // `nik` intentionally omitted (PII per redactor.ts PII_FIELDS).
  ],
  filters: [
    {
      key: "program",
      label: "Program",
      kind: "SELECT",
      // Options loader deferred to p2-scaffold-pages — chip wires to
      // a Program lookup at that point.
      options: [],
    },
    {
      key: "gender",
      label: "Jenis Kelamin",
      kind: "SELECT",
      options: [...GENDER_OPTIONS],
    },
    {
      key: "enrolled",
      label: "Status Pendaftaran",
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
          def: { kind: "TEXT", placeholder: "Nama lengkap siswa", maxLength: 255 },
          label: "Nama Lengkap",
          required: true,
        },
        {
          key: "nickname",
          def: { kind: "TEXT", placeholder: "Nama panggilan", maxLength: 100 },
          label: "Nama Panggilan",
        },
        {
          key: "gender",
          def: { kind: "ENUM", enumName: "Gender", options: GENDER_OPTIONS },
          label: "Jenis Kelamin",
          required: true,
        },
        {
          key: "nik",
          def: { kind: "TEXT", placeholder: "16 digit NIK", maxLength: 16 },
          label: "NIK",
          helpText: "Nomor Induk Kependudukan (16 digit).",
        },
        {
          key: "birthPlace",
          def: { kind: "TEXT", placeholder: "Kota lahir", maxLength: 100 },
          label: "Tempat Lahir",
        },
        {
          key: "birthDate",
          def: { kind: "DATE" },
          label: "Tanggal Lahir",
        },
      ],
    },
    {
      key: "kategorisasi",
      label: "Kategorisasi",
      fields: [
        {
          key: "programId",
          def: { kind: "RELATION", resource: "Program", labelField: "name" },
          label: "Program",
          required: true,
        },
        {
          key: "householdId",
          def: { kind: "RELATION", resource: "Household", labelField: "code" },
          label: "Keluarga",
          required: true,
        },
        {
          key: "nis",
          def: { kind: "TEXT", placeholder: "Nomor Induk Siswa", maxLength: 50 },
          label: "NIS",
          helpText: "Dialokasikan otomatis oleh NIS allocator saat pendaftaran selesai.",
        },
        {
          key: "enrolledAt",
          def: { kind: "DATE" },
          label: "Tanggal Masuk",
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
      key: "wali",
      label: "Wali",
      render: () => React.createElement("div", null, "(deferred)"),
    },
    {
      key: "riwayat",
      label: "Riwayat",
      render: () => React.createElement("div", null, "(deferred)"),
    },
    {
      key: "lampiran",
      label: "Lampiran",
      render: () => React.createElement("div", null, "(deferred)"),
    },
    {
      key: "aktivitas",
      label: "Aktivitas",
      render: () => React.createElement("div", null, "(deferred)"),
    },
  ],
  // Detail-page actions (e.g. soft-delete confirmation) land in
  // p2-scaffold-pages alongside the action layer.
  detailActions: [],
  dataFetcher: async (params) => {
    // Clause 1 — session resolve.
    const session = await getSession();
    if (!session) throw new Error("UNAUTHENTICATED");

    // Clause 7 — search predicate. Trigram GIN exists on Student.fullName
    // (migration 07); Prisma `contains` doesn't exploit it but is correct.
    const search = params.search?.trim();
    const searchPredicate =
      search && search.length > 0
        ? {
            OR: [
              { fullName: { contains: search, mode: "insensitive" as const } },
              { nis: { contains: search } },
              { nik: { contains: search } },
            ],
          }
        : {};

    // Filter predicates per cycle Assumption §8.
    const filterPredicates: Record<string, unknown> = {};
    const programFilter = params.filters.program;
    if (typeof programFilter === "string" && programFilter.length > 0) {
      filterPredicates.programId = programFilter;
    }
    const genderFilter = params.filters.gender;
    if (genderFilter === "MALE" || genderFilter === "FEMALE") {
      filterPredicates.gender = genderFilter;
    }
    const enrolledFilter = params.filters.enrolled;
    if (enrolledFilter === true) {
      filterPredicates.enrolledAt = { not: null };
    } else if (enrolledFilter === false) {
      filterPredicates.enrolledAt = null;
    }

    // Clause 2 + 3 — tenant filter + soft-delete filter (softDelete: true).
    const where = {
      tenantId: session.tenantId,
      deletedAt: null,
      ...searchPredicate,
      ...filterPredicates,
    };

    // Clause 5 — sort handling. Default: fullName asc.
    const orderBy = params.sort
      ? { [params.sort.field]: params.sort.dir }
      : { fullName: "asc" as const };

    // Clause 6 — pagination + parallel count.
    const [rows, total] = await Promise.all([
      prisma.student.findMany({
        where,
        take: params.pageSize,
        skip: (params.page - 1) * params.pageSize,
        orderBy,
        include: { program: { select: { name: true } } },
      }),
      prisma.student.count({ where }),
    ]);

    return { rows: rows as ReadonlyArray<Student>, total };
  },
};

export default entity;
