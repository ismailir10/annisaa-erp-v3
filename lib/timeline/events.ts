// TimelineEvent registry — typed kinds + Zod-validated payloads + audit bridge.
//
// Each entry pairs a kebab-case `kind` (matches TimelineEvent.kind VARCHAR(50))
// with its Prisma `subjectKind`, default visibility tier, and a Zod payload
// schema. The literal is declared `as const satisfies ...` so each entry's
// concrete payloadSchema type survives — `TimelineEventPayload<K>` resolves to
// the inferred object shape, not `any`. (A widening assignment through a
// `TimelineEventEntry` type would erase the schema type — avoid that path.)
//
// Polymorphic kinds (e.g. `note.added`) carry the `"*"` sentinel for
// `subjectKind`; the emit middleware demands a caller-supplied `subjectKind`
// for those and ignores it for non-polymorphic kinds.
//
// Spec: docs/superpowers/specs/2026-05-04-erp-rebuild-foundation-design.md §4.1 + §4.2
// Cycle: docs/cycles/2026-05-06-p1-timeline-registry.md

import { z } from "zod";
import type { TimelineVisibility } from "@/lib/generated/prisma/client";
import { TimelineVisibility as TimelineVisibilityEnum } from "@/lib/generated/prisma/client";

const _TIMELINE_EVENTS_RAW = {
  "student.admitted": {
    subjectKind: "Student",
    defaultVisibility: TimelineVisibilityEnum.PARENT_VISIBLE,
    payloadSchema: z.object({
      programId: z.string().optional(),
      admittedAt: z.string().optional(),
    }).strict(),
  },
  "student.enrolled": {
    subjectKind: "Student",
    defaultVisibility: TimelineVisibilityEnum.PARENT_VISIBLE,
    payloadSchema: z.object({
      classSectionId: z.string().optional(),
    }).strict(),
  },
  "student.soft-deleted": {
    subjectKind: "Student",
    defaultVisibility: TimelineVisibilityEnum.INTERNAL,
    payloadSchema: z.object({}).strict(),
  },
  "student.restored": {
    subjectKind: "Student",
    defaultVisibility: TimelineVisibilityEnum.INTERNAL,
    payloadSchema: z.object({}).strict(),
  },
  "employee.hired": {
    subjectKind: "Employee",
    defaultVisibility: TimelineVisibilityEnum.INTERNAL,
    payloadSchema: z.object({
      employmentType: z.string().optional(),
    }).strict(),
  },
  "employee.soft-deleted": {
    subjectKind: "Employee",
    defaultVisibility: TimelineVisibilityEnum.INTERNAL,
    payloadSchema: z.object({}).strict(),
  },
  "employee.terminated": {
    // Reserved for the future explicit-termination workflow that emits
    // directly via emitTimelineEvent. The SOFT_DELETE bridge points at
    // `employee.soft-deleted`, NOT this kind — soft-delete is record
    // archival; termination is an HR state change.
    subjectKind: "Employee",
    defaultVisibility: TimelineVisibilityEnum.PRIVATE,
    payloadSchema: z.object({
      reason: z.string().optional(),
    }).strict(),
  },
  "note.added": {
    // Polymorphic — emit middleware uses caller's `input.subjectKind`.
    subjectKind: "*",
    defaultVisibility: TimelineVisibilityEnum.INTERNAL,
    payloadSchema: z.object({
      text: z.string().min(1).max(2000),
    }).strict(),
  },
  "admission.status-changed": {
    // Emitted on every legal Admission state transition by the wrapper actions
    // in `lib/admission/transitions/*.ts`. INTERNAL by default — parent-portal
    // surfacing of admission status lands in a future cycle (a public
    // `/lacak-pendaftaran/<trackingCode>` page outside of the timeline event
    // stream). The two AdmissionStatus values are stored as plain strings so
    // the registry stays free of Prisma-enum imports beyond TimelineVisibility.
    subjectKind: "Admission",
    defaultVisibility: TimelineVisibilityEnum.INTERNAL,
    payloadSchema: z.object({
      from: z.string().min(1),
      to: z.string().min(1),
      reason: z.string().max(2000).optional(),
    }).strict(),
  },
} as const satisfies Record<
  string,
  {
    subjectKind: string;
    defaultVisibility: TimelineVisibility;
    payloadSchema: z.ZodTypeAny;
  }
>;

export const TIMELINE_EVENTS = Object.freeze(_TIMELINE_EVENTS_RAW);
export type TimelineEventKind = keyof typeof TIMELINE_EVENTS;
export type TimelineEventPayload<K extends TimelineEventKind> = z.infer<
  (typeof TIMELINE_EVENTS)[K]["payloadSchema"]
>;

// Audit→timeline bridge map. When writeAuditLog runs with action SOFT_DELETE
// or RESTORE on a resource keyed here, the bridge emits the matched timeline
// kind in the same client (tx ?? prisma). Partial coverage allowed (Employee
// SOFT_DELETE only this cycle — `employee.restored` deferred to entity cycle
// that needs it; bridge surfaces a console.warn for the gap).
export const RESOURCE_TO_SOFT_DELETE_KIND = Object.freeze({
  Student: {
    SOFT_DELETE: "student.soft-deleted",
    RESTORE: "student.restored",
  },
  Employee: {
    SOFT_DELETE: "employee.soft-deleted",
  },
} as const satisfies Record<
  string,
  Partial<Record<"SOFT_DELETE" | "RESTORE", TimelineEventKind>>
>);
