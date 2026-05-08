// Admission funnel state-machine algebra (cycle p2-admission-funnel-schema T2).
//
// Pure transition graph + assertion helpers. NO Prisma client, NO session
// resolver, NO HTTP — server-action wrapping (assertScope + writeAuditLog +
// emitTimelineEvent + ACCEPTED side-effect bundle) lives in the UI cycle's
// `lib/admission/transitions/*` server actions.
//
// 8-state taxonomy locked per cycle Spec Assumption 1. Foundation §10A.4 line
// 852 sketches a 13-state finance-coupled taxonomy (INVOICE_SENT / PAID /
// PROMOTED / AWAITING_MPLS / PORTAL_ACTIVE / DROPPED / AUTO_DROPPED) — scope-
// locked out of this cycle; future P3 cycles extend additively (`ALTER TYPE
// ... ADD VALUE`).
//
// Transition table — exactly 12 legal edges:
//
//   DRAFT                 → SUBMITTED, WITHDRAWN
//   SUBMITTED             → UNDER_REVIEW, REJECTED, WITHDRAWN
//   UNDER_REVIEW          → INTERVIEW_SCHEDULED, OFFER_EXTENDED, REJECTED, WITHDRAWN
//   INTERVIEW_SCHEDULED   → OFFER_EXTENDED, REJECTED, WITHDRAWN
//   OFFER_EXTENDED        → ACCEPTED, REJECTED, WITHDRAWN
//   ACCEPTED              → (terminal)
//   REJECTED              → (terminal)
//   WITHDRAWN             → (terminal)
//
// Self-loops are illegal at this layer (the algebra rejects them). Skip-ahead
// transitions (e.g. DRAFT → ACCEPTED) are also illegal. The
// UNDER_REVIEW → OFFER_EXTENDED edge is intentional (admin fast-tracks known
// referrals past the interview step).
//
// Spec: docs/cycles/2026-05-09-p2-admission-funnel-schema.md §State Transitions

import { AdmissionStatus } from "@/lib/generated/prisma/enums";

export const ADMISSION_TRANSITIONS: Readonly<
  Record<AdmissionStatus, ReadonlyArray<AdmissionStatus>>
> = Object.freeze({
  [AdmissionStatus.DRAFT]: Object.freeze([
    AdmissionStatus.SUBMITTED,
    AdmissionStatus.WITHDRAWN,
  ]),
  [AdmissionStatus.SUBMITTED]: Object.freeze([
    AdmissionStatus.UNDER_REVIEW,
    AdmissionStatus.REJECTED,
    AdmissionStatus.WITHDRAWN,
  ]),
  [AdmissionStatus.UNDER_REVIEW]: Object.freeze([
    AdmissionStatus.INTERVIEW_SCHEDULED,
    AdmissionStatus.OFFER_EXTENDED,
    AdmissionStatus.REJECTED,
    AdmissionStatus.WITHDRAWN,
  ]),
  [AdmissionStatus.INTERVIEW_SCHEDULED]: Object.freeze([
    AdmissionStatus.OFFER_EXTENDED,
    AdmissionStatus.REJECTED,
    AdmissionStatus.WITHDRAWN,
  ]),
  [AdmissionStatus.OFFER_EXTENDED]: Object.freeze([
    AdmissionStatus.ACCEPTED,
    AdmissionStatus.REJECTED,
    AdmissionStatus.WITHDRAWN,
  ]),
  [AdmissionStatus.ACCEPTED]: Object.freeze([]),
  [AdmissionStatus.REJECTED]: Object.freeze([]),
  [AdmissionStatus.WITHDRAWN]: Object.freeze([]),
});

const TERMINAL_STATES: ReadonlySet<AdmissionStatus> = new Set([
  AdmissionStatus.ACCEPTED,
  AdmissionStatus.REJECTED,
  AdmissionStatus.WITHDRAWN,
]);

export function isTerminalAdmissionStatus(status: AdmissionStatus): boolean {
  return TERMINAL_STATES.has(status);
}

export function canTransition(
  from: AdmissionStatus,
  to: AdmissionStatus,
): boolean {
  const allowed = ADMISSION_TRANSITIONS[from];
  return allowed.includes(to);
}

/**
 * Throws on illegal transition. Returns void on legal. Error message format:
 * `INVALID_TRANSITION: <from> → <to>` — server-action layer surfaces this as
 * the `error` field of `ActionResult<T>` after stripping the prefix.
 */
export function assertTransition(
  from: AdmissionStatus,
  to: AdmissionStatus,
): void {
  if (!canTransition(from, to)) {
    throw new Error(`INVALID_TRANSITION: ${from} → ${to}`);
  }
}
