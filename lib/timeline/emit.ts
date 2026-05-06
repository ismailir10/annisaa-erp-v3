// emitTimelineEvent — server-only TimelineEvent write path.
//
// Looks up the kind in TIMELINE_EVENTS, validates the caller's payload via
// the registered Zod schema, resolves the subjectKind (registry value for
// non-polymorphic kinds; caller-supplied for the "*" sentinel), defaults
// visibility from the registry, then INSERTs via (tx ?? prisma).
//
// Non-polymorphic kinds reject a caller-supplied subjectKind that disagrees
// with the registry — silent override would let typos drift into the column.
//
// Spec: docs/superpowers/specs/2026-05-04-erp-rebuild-foundation-design.md §4.1 + §4.2
// Cycle: docs/cycles/2026-05-06-p1-timeline-registry.md
//
// Server-only by construction: imports `prisma` from `@/lib/db`, which
// throws if `DATABASE_URL` is missing — accidental client-bundle inclusion
// fails fast at runtime. Same boundary marker as `writeAuditLog`.
//
// Why JSON-normalize the payload: PrismaPg forwards `Json` column values
// to pg as-is, so a raw `Date` would coerce via the driver's default
// toString — silent data loss. JSON.parse(JSON.stringify(...)) yields a
// plain JSON-safe shape (Date → ISO string via Date.prototype.toJSON;
// Decimal → string via its toJSON; functions / undefined drop). Today's
// registry payloads are string-only, but the registry is open for entity
// cycles to extend with date / decimal fields — keeping parity with
// writeAuditLog's normalize step prevents drift on the next extension.

import { prisma } from "@/lib/db";
import type { Prisma, TimelineVisibility } from "@/lib/generated/prisma/client";
import {
  TIMELINE_EVENTS,
  type TimelineEventKind,
  type TimelineEventPayload,
} from "./events";

export type EmitTimelineEventInput<K extends TimelineEventKind> = {
  tenantId: string;
  /** Required-and-nullable: pass explicit `null` for system actions. */
  actorUserId: string | null;
  kind: K;
  /** Required iff registry entry's subjectKind is the "*" sentinel. */
  subjectKind?: string;
  subjectId: string;
  payload: TimelineEventPayload<K>;
  /** Override the registry default. */
  visibility?: TimelineVisibility;
  /** Defaults to `now()` at the DB layer if omitted. */
  occurredAt?: Date;
};

export async function emitTimelineEvent<K extends TimelineEventKind>(
  input: EmitTimelineEventInput<K>,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  if (input.tenantId == null || input.tenantId === "") {
    throw new Error("emitTimelineEvent: tenantId is required");
  }
  if (input.kind == null || (input.kind as string) === "") {
    throw new Error("emitTimelineEvent: kind is required");
  }
  if (input.subjectId == null || input.subjectId === "") {
    throw new Error("emitTimelineEvent: subjectId is required");
  }

  const entry = TIMELINE_EVENTS[input.kind];
  if (!entry) {
    throw new Error(`emitTimelineEvent: unknown kind '${String(input.kind)}'`);
  }

  // Re-throw the Zod error unchanged so the caller sees the formatted path.
  entry.payloadSchema.parse(input.payload);

  let subjectKind: string;
  if (entry.subjectKind === "*") {
    if (input.subjectKind == null || input.subjectKind === "") {
      throw new Error(
        `emitTimelineEvent: kind '${input.kind}' is polymorphic — input.subjectKind is required`,
      );
    }
    subjectKind = input.subjectKind;
  } else {
    if (
      input.subjectKind != null &&
      input.subjectKind !== "" &&
      input.subjectKind !== entry.subjectKind
    ) {
      throw new Error(
        `emitTimelineEvent: subjectKind mismatch for kind '${input.kind}': registry='${entry.subjectKind}', input='${input.subjectKind}'`,
      );
    }
    subjectKind = entry.subjectKind;
  }

  const visibility = input.visibility ?? entry.defaultVisibility;
  const client = tx ?? prisma;

  // JSON-normalize the payload (see header note) — parity with writeAuditLog.
  const normalizedPayload = JSON.parse(
    JSON.stringify(input.payload),
  ) as Prisma.InputJsonValue;

  const data: Prisma.TimelineEventUncheckedCreateInput = {
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    kind: input.kind,
    subjectKind,
    subjectId: input.subjectId,
    visibility,
    payload: normalizedPayload,
  };
  if (input.occurredAt !== undefined) {
    data.occurredAt = input.occurredAt;
  }

  await client.timelineEvent.create({ data });
}
