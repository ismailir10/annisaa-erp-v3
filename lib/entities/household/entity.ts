// Household — `EntityDef` instance per spec §5.10.
//
// Cycle: docs/cycles/2026-05-06-p2-scaffold-registries.md (T4)
//
// dataFetcher follows the cycle's "Shared dataFetcher contract" — admin
// tenant-scoped only this cycle (clauses 1, 2, 3, 5, 6, 7). Clause 4
// (OWN_STUDENT fail-closed branch) does NOT apply to Household: no role
// declares OWN_STUDENT for Household read in policy.ts. Default sort:
// `code asc`.
//
// Filter floor deviation (cycle Assumption §8 — explicit, documented):
// spec §5.10 sets a 3-5 chip-filter floor per entity; Household ships ONE
// filter (`search`). Rationale: Household is rarely browsed standalone —
// the typical access path is the Student detail-page Wali tab, where the
// household appears in context. Synthetic filters (e.g. "has-students" /
// "address-set") would be noise without a corresponding browse use case.
// scaffold.md §5 documents this as the canonical under-floor deviation
// pattern; future entities must justify deviations the same way.
//
// listColumns scope (per cycle Tasks T4 + spec §5.5 renderer table):
// `code` (TEXT) + `notes` (TEXT) only. The `_count.students` counter
// CANNOT live in `listColumns` — `EntityDef.listColumns[].field: keyof
// Household & string` and `_count` is not a key of the Household model
// type. The household-member counter is deferred to the detail-page
// `anggota` tab in `p2-scaffold-pages`. The dataFetcher still includes
// `_count: { students: true }` so consumers reading `rows[i]._count`
// at runtime have the data — list render path does NOT surface it.
//
// PII: Household carries no `/// @PII` schema annotations
// (`lib/audit/redactor.ts` `PII_FIELDS` has no Household entry). No list-
// surface exclusion required.
//
// Detail tabs render placeholders this cycle per Assumption §10. Real tab
// content lands `p2-scaffold-pages` (anggota tab will surface household
// members from `students` + future Guardian-household link).

import * as React from "react";
import type { ZodType } from "zod";

import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import type { DataFetcher, EntityDef } from "@/lib/scaffold";
import type { Household } from "@/lib/generated/prisma/client";
import { householdSchema } from "./schema";

// Row type widens the Prisma `Household` model with the `_count.students`
// counter that the dataFetcher includes. Keeps `EntityDef.listColumns[].field`
// + future detail-page consumers fully type-safe (vs. narrowing to
// `HouseholdInput` which loses id / timestamps / _count).
export type HouseholdRow = Household & {
  _count: { students: number };
};

const dataFetcher: DataFetcher<HouseholdRow> = async (params) => {
  // Clause 1 — Session resolve (engine signature accepts no session arg).
  const session = await getSession();
  if (!session) throw new Error("UNAUTHENTICATED");

  // Clause 7 — Search predicate: OR over `code` + `notes` (case-insensitive
  // `contains`). No filter predicates beyond search this cycle (per cycle
  // Assumption §8 explicit under-floor deviation).
  const searchPredicate =
    params.search && params.search.length > 0
      ? {
          OR: [
            { code: { contains: params.search, mode: "insensitive" as const } },
            { notes: { contains: params.search, mode: "insensitive" as const } },
          ],
        }
      : {};

  // Clause 2 — tenant filter. Clause 3 — soft-delete (softDelete=true).
  const where = {
    tenantId: session.tenantId,
    deletedAt: null,
    ...searchPredicate,
  };

  // Clause 5 — sort handling: explicit `params.sort` wins; default `code asc`.
  const orderBy = params.sort
    ? { [params.sort.field]: params.sort.dir }
    : { code: "asc" as const };

  // Clause 6 — paginate + count in parallel. `_count.students` included so
  // future consumers (detail-page anggota tab) read the counter without an
  // extra round-trip; list render path does not surface it (no listColumn).
  const [rows, total] = await Promise.all([
    prisma.household.findMany({
      where,
      take: params.pageSize,
      skip: (params.page - 1) * params.pageSize,
      orderBy,
      include: { _count: { select: { students: true } } },
    }),
    prisma.household.count({ where }),
  ]);

  return {
    rows: rows as ReadonlyArray<HouseholdRow>,
    total,
  };
};

export const householdEntity: EntityDef<HouseholdRow> = {
  key: "household",
  label: "Keluarga",
  labelSingular: "Keluarga",
  icon: "Home",
  // Schema validates admin INPUT only — narrower than the row type. Cast to the
  // engine's `ZodType<HouseholdRow>` slot. Runtime `schema.parse(input)`
  // calls remain unaffected — they only see input-shape values.
  schema: householdSchema as unknown as ZodType<HouseholdRow>,
  resource: "Household",
  searchFields: ["code", "notes"] as const,
  listColumns: [
    {
      field: "code",
      label: "Kode",
      render: { kind: "TEXT" },
      sortable: true,
    },
    {
      field: "notes",
      label: "Catatan",
      render: { kind: "TEXT" },
    },
  ],
  filters: [
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
          key: "code",
          def: { kind: "TEXT", maxLength: 50 },
          label: "Kode",
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
      key: "anggota",
      label: "Anggota",
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

export default householdEntity;
