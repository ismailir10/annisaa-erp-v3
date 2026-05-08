// Address — `EntityDef` instance per spec §5.10.
//
// Cycle: docs/cycles/2026-05-08-p2-addresses-idn-chain.md (T2)
//
// Address detail page is NOT a top-level admin nav target this cycle —
// always accessed via Household detail. Minimal entity provided for
// registry consistency + future scaffold mounts.
//
// dataFetcher follows the cycle's "Shared dataFetcher contract" — admin
// tenant-scoped only this cycle (clauses 1, 2, 3, 5, 6, 7). Default sort:
// `streetLine asc`.
//
// Filter floor deviation (cycle Out-of-scope §6 + scaffold.md §3 floor
// exemption): spec §5.10 sets a 3-5 chip-filter floor; Address ships ONE
// filter (`search`). Rationale: Address is never browsed standalone — the
// typical access path is the Household detail page where the address appears
// in context. Synthetic location filters (e.g. "by province") would be noise
// without a corresponding standalone browse use case; they belong in the
// Household list once Household→Address join is wired.
//
// PII: Address carries no `/// @PII` schema annotations. `streetLine`,
// `rt`, `rw`, `postalCode`, `notes` are all safe for list surface — no
// exclusion required.
//
// Detail tabs render placeholders this cycle per spec Out-of-scope §6.
// Real tab content (region info, households using this address) lands in a
// follow-up cycle.

import * as React from "react";
import type { ZodType } from "zod";

import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import type { DataFetcher, EntityDef } from "@/lib/scaffold";
import type { Address } from "@/lib/generated/prisma/client";
import { addressSchema } from "./schema";

const dataFetcher: DataFetcher<Address> = async (params) => {
  // Clause 1 — Session resolve (engine signature accepts no session arg).
  const session = await getSession();
  if (!session) throw new Error("UNAUTHENTICATED");

  // Clause 7 — Search predicate: OR over `streetLine` + `notes`
  // (case-insensitive `contains`). No additional chip filters this cycle
  // (under-floor deviation — see file header).
  const searchPredicate =
    params.search && params.search.length > 0
      ? {
          OR: [
            { streetLine: { contains: params.search, mode: "insensitive" as const } },
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

  // Clause 5 — sort handling: explicit `params.sort` wins; default `streetLine asc`.
  const orderBy = params.sort
    ? { [params.sort.field]: params.sort.dir }
    : { streetLine: "asc" as const };

  // Clause 6 — paginate + count in parallel.
  const [rows, total] = await Promise.all([
    prisma.address.findMany({
      where,
      take: params.pageSize,
      skip: (params.page - 1) * params.pageSize,
      orderBy,
    }),
    prisma.address.count({ where }),
  ]);

  return {
    rows: rows as ReadonlyArray<Address>,
    total,
  };
};

export const addressEntity: EntityDef<Address> = {
  key: "address",
  label: "Alamat",
  labelSingular: "Alamat",
  icon: "MapPin",
  // Schema validates admin INPUT only — narrower than the Prisma row type.
  // Cast to the engine's `ZodType<Address>` slot; runtime `schema.parse(input)`
  // calls remain unaffected.
  schema: addressSchema as unknown as ZodType<Address>,
  resource: "Address",
  searchFields: ["streetLine", "notes"] as const,
  listColumns: [
    {
      field: "streetLine",
      label: "Jalan",
      render: { kind: "TEXT" },
      sortable: true,
    },
    {
      field: "districtId",
      label: "Kelurahan/Kecamatan",
      render: { kind: "TEXT" },
    },
    {
      field: "postalCode",
      label: "Kode Pos",
      render: { kind: "TEXT" },
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
      key: "lokasi",
      label: "Lokasi",
      fields: [
        {
          key: "provinceId",
          def: { kind: "TEXT", maxLength: 2 },
          label: "Provinsi (kode BPS 2 digit)",
          required: true,
        },
        {
          key: "regencyId",
          def: { kind: "TEXT", maxLength: 4 },
          label: "Kabupaten/Kota (kode BPS 4 digit)",
          required: true,
        },
        {
          key: "districtId",
          def: { kind: "TEXT", maxLength: 6 },
          label: "Kecamatan (kode BPS 6 digit)",
          required: true,
        },
        {
          key: "villageId",
          def: { kind: "TEXT", maxLength: 10 },
          label: "Kelurahan/Desa (kode BPS 10 digit)",
        },
        {
          key: "streetLine",
          def: { kind: "TEXTAREA", maxLength: 500, rows: 2 },
          label: "Alamat Jalan",
          required: true,
        },
        {
          key: "rt",
          def: { kind: "TEXT", maxLength: 3 },
          label: "RT",
        },
        {
          key: "rw",
          def: { kind: "TEXT", maxLength: 3 },
          label: "RW",
        },
        {
          key: "postalCode",
          def: { kind: "TEXT", maxLength: 5 },
          label: "Kode Pos",
        },
        {
          key: "notes",
          def: { kind: "TEXTAREA", maxLength: 1000, rows: 2 },
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
  ],
  detailActions: [],
  dataFetcher,
};

// Canonical alias for scaffold-check static guard.
export const entity = addressEntity;

export default addressEntity;
