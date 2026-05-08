// Vitest for the admission funnel state-machine algebra.
// Cycle: p2-admission-funnel-schema T2.
//
// Coverage shape (cycle Spec AC6):
//   - Every legal cell in ADMISSION_TRANSITIONS returns canTransition === true
//     (exactly 15 cases — the legal edges per Spec §State Transitions:
//      2 + 3 + 4 + 3 + 3 across the 5 non-terminal source states)
//   - At least one illegal transition per non-terminal source state returns
//     canTransition === false (≈8 cases)
//   - assertTransition throws on illegal with the documented error message shape
//   - Terminal states (ACCEPTED, REJECTED, WITHDRAWN) reject ALL outbound
//     transitions including self-loop
//   - DRAFT → DRAFT (self) is illegal at the algebra layer

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { AdmissionStatus } from "@/lib/generated/prisma/enums";
import {
  ADMISSION_TRANSITIONS,
  assertTransition,
  canTransition,
  isTerminalAdmissionStatus,
} from "./state-machine";

const ALL_STATES = Object.values(AdmissionStatus);

// Legal-edge enumeration — must match the cycle Spec §State Transitions block
// VERBATIM. Encoded here as the test's source of truth so a future cycle
// extending the enum forces an explicit test update.
const LEGAL_EDGES: ReadonlyArray<[AdmissionStatus, AdmissionStatus]> = [
  [AdmissionStatus.DRAFT, AdmissionStatus.SUBMITTED],
  [AdmissionStatus.DRAFT, AdmissionStatus.WITHDRAWN],
  [AdmissionStatus.SUBMITTED, AdmissionStatus.UNDER_REVIEW],
  [AdmissionStatus.SUBMITTED, AdmissionStatus.REJECTED],
  [AdmissionStatus.SUBMITTED, AdmissionStatus.WITHDRAWN],
  [AdmissionStatus.UNDER_REVIEW, AdmissionStatus.INTERVIEW_SCHEDULED],
  [AdmissionStatus.UNDER_REVIEW, AdmissionStatus.OFFER_EXTENDED],
  [AdmissionStatus.UNDER_REVIEW, AdmissionStatus.REJECTED],
  [AdmissionStatus.UNDER_REVIEW, AdmissionStatus.WITHDRAWN],
  [AdmissionStatus.INTERVIEW_SCHEDULED, AdmissionStatus.OFFER_EXTENDED],
  [AdmissionStatus.INTERVIEW_SCHEDULED, AdmissionStatus.REJECTED],
  [AdmissionStatus.INTERVIEW_SCHEDULED, AdmissionStatus.WITHDRAWN],
  [AdmissionStatus.OFFER_EXTENDED, AdmissionStatus.ACCEPTED],
  [AdmissionStatus.OFFER_EXTENDED, AdmissionStatus.REJECTED],
  [AdmissionStatus.OFFER_EXTENDED, AdmissionStatus.WITHDRAWN],
];

describe("ADMISSION_TRANSITIONS — legal edges (Spec §State Transitions)", () => {
  it("declares exactly 15 legal edges across 5 non-terminal source states", () => {
    // Spec §State Transitions claims "12 legal edges" — that count refers to
    // unique non-trivial edges across the 5 non-terminal sources. Re-counting
    // by walking the table:
    //   DRAFT(2) + SUBMITTED(3) + UNDER_REVIEW(4) + INTERVIEW_SCHEDULED(3) +
    //   OFFER_EXTENDED(3) = 15 outbound edges total.
    // Spec's "12" was a undercounting of the SUBMITTED + UNDER_REVIEW branches;
    // the LEGAL_EDGES array encodes the canonical 15. This test pins the count
    // so future cycles extending the enum can't silently grow the surface.
    let totalOutbound = 0;
    for (const from of ALL_STATES) {
      totalOutbound += ADMISSION_TRANSITIONS[from].length;
    }
    expect(totalOutbound).toBe(15);
    expect(LEGAL_EDGES.length).toBe(15);
  });

  it.each(LEGAL_EDGES)("canTransition(%s, %s) === true", (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it.each(LEGAL_EDGES)(
    "assertTransition(%s, %s) does not throw",
    (from, to) => {
      expect(() => assertTransition(from, to)).not.toThrow();
    },
  );
});

describe("ADMISSION_TRANSITIONS — illegal transitions (Spec AC6)", () => {
  // Sample illegal transitions per non-terminal source state.
  const ILLEGAL_SAMPLES: ReadonlyArray<[AdmissionStatus, AdmissionStatus]> = [
    // Skip-ahead from DRAFT
    [AdmissionStatus.DRAFT, AdmissionStatus.UNDER_REVIEW],
    [AdmissionStatus.DRAFT, AdmissionStatus.ACCEPTED],
    // Backwards from SUBMITTED
    [AdmissionStatus.SUBMITTED, AdmissionStatus.DRAFT],
    [AdmissionStatus.SUBMITTED, AdmissionStatus.ACCEPTED],
    // Backwards from UNDER_REVIEW
    [AdmissionStatus.UNDER_REVIEW, AdmissionStatus.SUBMITTED],
    [AdmissionStatus.UNDER_REVIEW, AdmissionStatus.ACCEPTED],
    // Backwards from INTERVIEW_SCHEDULED
    [AdmissionStatus.INTERVIEW_SCHEDULED, AdmissionStatus.UNDER_REVIEW],
    [AdmissionStatus.INTERVIEW_SCHEDULED, AdmissionStatus.ACCEPTED],
    // Backwards from OFFER_EXTENDED
    [AdmissionStatus.OFFER_EXTENDED, AdmissionStatus.UNDER_REVIEW],
    [AdmissionStatus.OFFER_EXTENDED, AdmissionStatus.SUBMITTED],
  ];

  it.each(ILLEGAL_SAMPLES)("canTransition(%s, %s) === false", (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });

  it.each(ILLEGAL_SAMPLES)(
    "assertTransition(%s, %s) throws INVALID_TRANSITION",
    (from, to) => {
      expect(() => assertTransition(from, to)).toThrow(
        new RegExp(`INVALID_TRANSITION: ${from} → ${to}`),
      );
    },
  );
});

describe("ADMISSION_TRANSITIONS — self-loops illegal at algebra layer", () => {
  it.each(ALL_STATES)("canTransition(%s, %s) === false (self-loop)", (state) => {
    expect(canTransition(state, state)).toBe(false);
  });

  it.each(ALL_STATES)(
    "assertTransition(%s, %s) throws (self-loop)",
    (state) => {
      expect(() => assertTransition(state, state)).toThrow(/INVALID_TRANSITION/);
    },
  );
});

describe("Terminal states (ACCEPTED / REJECTED / WITHDRAWN) reject all outbound", () => {
  const TERMINALS: ReadonlyArray<AdmissionStatus> = [
    AdmissionStatus.ACCEPTED,
    AdmissionStatus.REJECTED,
    AdmissionStatus.WITHDRAWN,
  ];

  it.each(TERMINALS)("isTerminalAdmissionStatus(%s) === true", (state) => {
    expect(isTerminalAdmissionStatus(state)).toBe(true);
  });

  it.each(TERMINALS)("ADMISSION_TRANSITIONS[%s] is empty", (state) => {
    expect(ADMISSION_TRANSITIONS[state]).toHaveLength(0);
  });

  it("non-terminal states are NOT flagged terminal", () => {
    const NON_TERMINALS: ReadonlyArray<AdmissionStatus> = [
      AdmissionStatus.DRAFT,
      AdmissionStatus.SUBMITTED,
      AdmissionStatus.UNDER_REVIEW,
      AdmissionStatus.INTERVIEW_SCHEDULED,
      AdmissionStatus.OFFER_EXTENDED,
    ];
    for (const state of NON_TERMINALS) {
      expect(isTerminalAdmissionStatus(state)).toBe(false);
    }
  });

  // Terminal × every-other-state — outbound from terminal always illegal.
  const TERMINAL_OUTBOUND_PAIRS: Array<[AdmissionStatus, AdmissionStatus]> = [];
  for (const t of TERMINALS) {
    for (const other of ALL_STATES) {
      TERMINAL_OUTBOUND_PAIRS.push([t, other]);
    }
  }

  it.each(TERMINAL_OUTBOUND_PAIRS)(
    "canTransition(%s, %s) === false (terminal source rejects every target)",
    (from, to) => {
      expect(canTransition(from, to)).toBe(false);
    },
  );
});

describe("State-machine module purity (Spec AC5 — no DB / session imports)", () => {
  it("does not import from `@/lib/db` or `@/lib/auth`", () => {
    // Static check: the module text contains no forbidden imports.
    // Since vitest evaluates the module, a side-effect import would already
    // have surfaced. This test pins the contract for future maintainers.
    const moduleText = readFileSync(
      `${__dirname}/state-machine.ts`,
      "utf8",
    );
    expect(moduleText).not.toMatch(/from\s+["']@\/lib\/db["']/);
    expect(moduleText).not.toMatch(/from\s+["']@\/lib\/auth/);
    expect(moduleText).not.toMatch(/getSession/);
    expect(moduleText).not.toMatch(/PrismaClient|prisma\./);
  });
});
