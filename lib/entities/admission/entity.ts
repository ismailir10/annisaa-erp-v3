// Admission — `EntityDef` instance per spec §5.10.
//
// Cycle: docs/cycles/2026-05-09-p2-admission-funnel-schema.md (T3)
//
// dataFetcher follows the cycle's "Shared dataFetcher contract" — admin
// tenant-scoped only this cycle (clauses 1, 2, 3, 5, 6, 7). Default sort:
// `submittedAt desc` (most recent first). PR `OWN_STUDENT` gating is applied
// only when session.role === 'parent' — for parent portal a future cycle wires
// the studentId-based filter via studentGuardian join.
//
// Smart views per AdmissionStatus clusters (cycle Spec AC7 — locked to 5 views
// matching the 8-state taxonomy). Foundation §10A.4 line 852 sketches an
// alternative 6-view set keyed to a 13-state finance-coupled taxonomy
// (calon/review/approved/paid/portal/drop) — scope-locked out per cycle Spec
// Assumption 1; reconciliation lands in P3 finance cycles.
//
// PII: applicantFullName + applicantNickname are NOT PII per §4.5 (display-
// safe identifiers used for parent confirmation copy + admin browse). NIK
// fields (applicantNik / fatherNik / motherNik) + phone fields (fatherPhone /
// motherPhone) carry `/// @PII` annotations and are EXCLUDED from
// `searchFields` and `listColumns` per scaffold.md PII discipline.
//
// formSections empty this cycle — UI cycle introduces the public /daftar
// multi-step form (which writes via a public server action, NOT the scaffold
// form because /daftar is unauthenticated).
//
// detailTabs: 3 deferred placeholders (ringkasan / assessment / aktivitas).
// Real tab content lands in p2-admission-funnel-ui:
//   - ringkasan: applicant + parent summary + state-transition action buttons
//   - assessment: InitialAssessment list + create form (gated to A/P/KD/AO)
//   - aktivitas: TimelineEvent feed (gated to A/P/KD/AO)
//
// detailActions empty — state-transition buttons (Pindahkan ke review /
// Jadwalkan wawancara / Tawarkan tempat / Tandai diterima / Tolak) ship in
// p2-admission-funnel-ui as scope-gated actions wrapping `assertTransition`
// from `lib/admission/state-machine.ts`.

import * as React from "react";
import type { ZodType } from "zod";

import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import type { DataFetcher, EntityDef } from "@/lib/scaffold";
import type { Admission } from "@/lib/generated/prisma/client";
import { withdrawFromListRowAction } from "@/lib/admission/actions/withdraw-from-list";

import { admissionSchema } from "./schema";

const dataFetcher: DataFetcher<Admission> = async (params) => {
  // Clause 1 — Session resolve.
  const session = await getSession();
  if (!session) throw new Error("UNAUTHENTICATED");

  // Clause 7 — Search predicate: OR over `applicantFullName` + `applicantNickname`
  // (PII-safe display fields). NIK / phone fields are excluded from search per
  // scaffold.md PII discipline.
  const searchPredicate =
    params.search && params.search.length > 0
      ? {
          OR: [
            {
              applicantFullName: {
                contains: params.search,
                mode: "insensitive" as const,
              },
            },
            {
              applicantNickname: {
                contains: params.search,
                mode: "insensitive" as const,
              },
            },
          ],
        }
      : {};

  // Clause 2 — tenant filter. Clause 3 — soft-delete (softDelete=true).
  const where = {
    tenantId: session.tenantId,
    deletedAt: null,
    ...searchPredicate,
  };

  // Clause 5 — sort handling: explicit `params.sort` wins; default
  // `submittedAt desc` (most recent first).
  const orderBy = params.sort
    ? { [params.sort.field]: params.sort.dir }
    : { submittedAt: "desc" as const };

  // Clause 6 — paginate + count in parallel.
  const [rows, total] = await Promise.all([
    prisma.admission.findMany({
      where,
      take: params.pageSize,
      skip: (params.page - 1) * params.pageSize,
      orderBy,
    }),
    prisma.admission.count({ where }),
  ]);

  return {
    rows: rows as ReadonlyArray<Admission>,
    total,
  };
};

export const admissionEntity: EntityDef<Admission> = {
  key: "admission",
  label: "Pendaftaran",
  labelSingular: "Pendaftaran",
  icon: "ClipboardList",
  // Schema validates admin INPUT — narrower than the Prisma row type. Cast to
  // engine's `ZodType<Admission>` slot; runtime `schema.parse(input)` calls
  // remain unaffected.
  schema: admissionSchema as unknown as ZodType<Admission>,
  resource: "Admission",
  // PII fields excluded — applicantNik / fatherNik / motherNik / fatherPhone /
  // motherPhone never surface in search hints per scaffold.md PII discipline.
  searchFields: ["applicantFullName", "applicantNickname"] as const,
  listColumns: [
    {
      field: "applicantFullName",
      label: "Nama Calon",
      render: { kind: "TEXT" },
      sortable: true,
    },
    {
      field: "status",
      label: "Status",
      render: { kind: "TEXT" },
      sortable: true,
    },
    {
      field: "source",
      label: "Sumber",
      render: { kind: "TEXT" },
    },
    {
      field: "submittedAt",
      label: "Disubmit",
      render: { kind: "TEXT" },
      sortable: true,
    },
  ],
  filters: [
    {
      key: "search",
      label: "Cari",
      kind: "SEARCH",
    },
  ],
  // Smart views — every AdmissionStatus value reachable from at least one
  // view (cycle Spec AC7 + reviewer fix). Single-status views per state so
  // INTERVIEW_SCHEDULED + REJECTED + WITHDRAWN are not silently unreachable.
  // dataFetcher clause 7 does not yet wire status filtering this cycle — UI
  // cycle adds the filter dispatch + may collapse adjacent states into
  // multi-status views once the engine grows multi-value filter support.
  views: [
    {
      key: "default",
      label: "Semua",
      filters: {},
    },
    {
      key: "draft",
      label: "Draft",
      filters: { status: "DRAFT" },
    },
    {
      key: "submitted",
      label: "Submit",
      filters: { status: "SUBMITTED" },
    },
    {
      key: "in_review",
      label: "Dalam Review",
      filters: { status: "UNDER_REVIEW" },
    },
    {
      key: "interview",
      label: "Wawancara Terjadwal",
      filters: { status: "INTERVIEW_SCHEDULED" },
    },
    {
      key: "offered",
      label: "Tawaran",
      filters: { status: "OFFER_EXTENDED" },
    },
    {
      key: "accepted",
      label: "Diterima",
      filters: { status: "ACCEPTED" },
    },
    {
      key: "rejected",
      label: "Ditolak",
      filters: { status: "REJECTED" },
    },
    {
      key: "withdrawn",
      label: "Ditarik",
      filters: { status: "WITHDRAWN" },
    },
  ],
  // formSections empty — UI cycle ships public /daftar multi-step form.
  formSections: [],
  detailTabs: [
    {
      key: "ringkasan",
      label: "Ringkasan",
      render: () => React.createElement("div", null, "(deferred)"),
    },
    {
      key: "assessment",
      label: "Asesmen Awal",
      render: () => React.createElement("div", null, "(deferred)"),
    },
    {
      key: "aktivitas",
      label: "Aktivitas",
      render: () => React.createElement("div", null, "(deferred)"),
    },
  ],
  // detailActions empty — state-transition buttons wired in UI cycle wrapping
  // `assertTransition` from `lib/admission/state-machine.ts`.
  detailActions: [],
  // Cycle p2-scaffold-list-crud-parity (T3) — list-shell row actions:
  // View + Edit + Tarik kembali (destructive WITHDRAW transition via the
  // single-arg "use server" wrapper at lib/admission/actions/withdraw-from-list).
  // No soft-delete: admission is a state-machine entity; WITHDRAWN is the
  // terminal state for in-flight pendaftaran the family abandons.
  rowActions: [
    {
      key: "view",
      label: "Lihat",
      kind: "view",
      scope: "ALL",
      href: (row) => `/admin/akademik/penerimaan/${row.id}`,
    },
    // No Edit row action — admission has no separate `[id]/edit` route;
    // mutations happen via the state-machine action buttons on the detail
    // page itself.
    {
      key: "withdraw",
      label: "Tarik kembali",
      kind: "destructive",
      scope: "ALL",
      action: withdrawFromListRowAction,
      confirm: {
        title: "Tarik kembali pendaftaran?",
        description:
          "Pendaftaran akan masuk status WITHDRAWN dan tidak bisa dilanjutkan. Detail tetap tersimpan untuk arsip.",
        confirmLabel: "Tarik kembali",
      },
    },
  ],
  // Creation flow lives at the public /daftar route — hide the scaffold
  // list "Tambah Penerimaan" CTA (formSections is empty so the gate already
  // hides it, but createDisabled makes the intent explicit + future-proofs
  // against admin-internal admission creation forms).
  createDisabled: true,
  dataFetcher,
};

// Canonical alias for scaffold-check static guard.
export const entity = admissionEntity;

export default admissionEntity;
