// @vitest-environment node
//
// Unit tests for reviewAdmission. Mocks the prisma client + tx callback so we
// exercise the orchestration without a live DB. Verifies:
//   - Happy path SUBMITTED → UNDER_REVIEW updates row, returns previousStatus.
//   - Illegal transition (DRAFT → UNDER_REVIEW) throws INVALID_TRANSITION.
//   - assertScope rejects role=parent with FORBIDDEN.
//   - Missing row (cross-tenant or unknown id) throws NOT_FOUND.
//   - Audit row written: UPDATE on Admission, before/after status snapshots,
//     actorUserId = session.userId.
//   - Timeline event emitted: kind=admission.status-changed,
//     payload.from=SUBMITTED, payload.to=UNDER_REVIEW, actorUserId=session.userId.
//
// Cycle: docs/cycles/2026-05-10-p2-admission-funnel-ui-review.md (T3)

import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdmissionStatus } from "@/lib/generated/prisma/enums";
import type { SessionContext } from "@/lib/auth/session";

vi.mock("@/lib/db", () => ({ prisma: {} }));

import { reviewAdmission } from "../review";

type AdmissionRow = {
  id: string;
  tenantId: string;
  status: AdmissionStatus;
};

function makePrismaMock(opts: { seed?: AdmissionRow | null } = {}) {
  const seed = opts.seed === undefined
    ? {
        id: "adm_1",
        tenantId: "t_demo",
        status: AdmissionStatus.SUBMITTED,
      }
    : opts.seed;

  const admissions: AdmissionRow[] = seed ? [seed] : [];
  const auditRows: Array<Record<string, unknown>> = [];
  const timelineRows: Array<Record<string, unknown>> = [];
  let nextOtherId = 1;

  const admission = {
    findFirst: vi.fn(
      async (args: {
        where: { id: string; tenantId: string };
      }) => {
        const r = admissions.find(
          (a) => a.id === args.where.id && a.tenantId === args.where.tenantId,
        );
        return r ? { id: r.id, status: r.status } : null;
      },
    ),
    update: vi.fn(
      async (args: {
        where: { id: string };
        data: { status: AdmissionStatus };
      }) => {
        const r = admissions.find((a) => a.id === args.where.id);
        if (!r) throw new Error("not_found");
        r.status = args.data.status;
        return { id: r.id, status: r.status };
      },
    ),
  };

  const auditLog = {
    create: vi.fn(async (args: { data: Record<string, unknown> }) => {
      auditRows.push({ id: `al${nextOtherId++}`, ...args.data });
      return { id: `al${nextOtherId}` };
    }),
  };
  const timelineEvent = {
    create: vi.fn(async (args: { data: Record<string, unknown> }) => {
      timelineRows.push({ id: `te${nextOtherId++}`, ...args.data });
      return { id: `te${nextOtherId}` };
    }),
  };

  const tx = { admission, auditLog, timelineEvent };

  const prisma = {
    ...tx,
    $transaction: vi.fn(async (fn: (txClient: typeof tx) => Promise<unknown>) => fn(tx)),
  };

  return { prisma, tx, admissions, auditRows, timelineRows };
}

const ADMIN_SESSION: SessionContext = {
  tenantId: "t_demo",
  userId: "u_admin",
  supabaseUserId: "sup_admin",
  role: "admin",
  currentTermId: "term_1",
};
const PARENT_SESSION: SessionContext = {
  ...ADMIN_SESSION,
  userId: "u_parent",
  role: "parent",
};

const BASE_INPUT = {
  admissionId: "adm_1",
  ipAddress: "127.0.0.1",
  userAgent: "vitest",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("reviewAdmission", () => {
  it("transitions SUBMITTED → UNDER_REVIEW and returns previousStatus", async () => {
    const m = makePrismaMock();
    const result = await reviewAdmission(
      m.prisma as never,
      ADMIN_SESSION,
      BASE_INPUT,
    );

    expect(m.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(m.tx.admission.findFirst).toHaveBeenCalledTimes(1);
    expect(m.tx.admission.update).toHaveBeenCalledTimes(1);
    expect(m.admissions[0].status).toBe(AdmissionStatus.UNDER_REVIEW);
    expect(result).toEqual({
      admissionId: "adm_1",
      status: AdmissionStatus.UNDER_REVIEW,
      previousStatus: AdmissionStatus.SUBMITTED,
    });
  });

  it("throws INVALID_TRANSITION when row is in DRAFT", async () => {
    const m = makePrismaMock({
      seed: { id: "adm_1", tenantId: "t_demo", status: AdmissionStatus.DRAFT },
    });
    await expect(
      reviewAdmission(m.prisma as never, ADMIN_SESSION, BASE_INPUT),
    ).rejects.toThrow("INVALID_TRANSITION: DRAFT → UNDER_REVIEW");
    // Update must NOT have been issued.
    expect(m.tx.admission.update).not.toHaveBeenCalled();
  });

  it("throws FORBIDDEN when caller role is parent", async () => {
    const m = makePrismaMock();
    await expect(
      reviewAdmission(m.prisma as never, PARENT_SESSION, BASE_INPUT),
    ).rejects.toThrow("FORBIDDEN");
    // Scope gate runs before the tx — no DB calls.
    expect(m.prisma.$transaction).not.toHaveBeenCalled();
    expect(m.tx.admission.findFirst).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND when admissionId does not exist", async () => {
    const m = makePrismaMock({ seed: null });
    await expect(
      reviewAdmission(m.prisma as never, ADMIN_SESSION, BASE_INPUT),
    ).rejects.toThrow("NOT_FOUND");
    expect(m.tx.admission.update).not.toHaveBeenCalled();
    expect(m.auditRows).toHaveLength(0);
    expect(m.timelineRows).toHaveLength(0);
  });

  it("writes one UPDATE audit row with before/after status + actorUserId", async () => {
    const m = makePrismaMock();
    await reviewAdmission(m.prisma as never, ADMIN_SESSION, BASE_INPUT);
    expect(m.auditRows).toHaveLength(1);
    expect(m.auditRows[0]).toMatchObject({
      action: "UPDATE",
      resource: "Admission",
      resourceId: "adm_1",
      tenantId: "t_demo",
      actorUserId: "u_admin",
      before: { status: AdmissionStatus.SUBMITTED },
      after: { status: AdmissionStatus.UNDER_REVIEW },
    });
  });

  it("emits one admission.status-changed timeline event with correct payload", async () => {
    const m = makePrismaMock();
    await reviewAdmission(m.prisma as never, ADMIN_SESSION, BASE_INPUT);
    expect(m.timelineRows).toHaveLength(1);
    expect(m.timelineRows[0]).toMatchObject({
      kind: "admission.status-changed",
      subjectKind: "Admission",
      subjectId: "adm_1",
      tenantId: "t_demo",
      actorUserId: "u_admin",
      payload: {
        from: AdmissionStatus.SUBMITTED,
        to: AdmissionStatus.UNDER_REVIEW,
      },
    });
  });
});
