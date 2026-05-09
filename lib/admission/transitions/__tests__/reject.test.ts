// @vitest-environment node
//
// Unit tests for rejectAdmission. Mocks the prisma client + tx callback so
// we exercise the orchestration without a live DB. Verifies:
//   - Happy path SUBMITTED → REJECTED.
//   - Each legal source state succeeds (SUBMITTED / UNDER_REVIEW /
//     INTERVIEW_SCHEDULED / OFFER_EXTENDED) via it.each.
//   - Illegal source states throw INVALID_TRANSITION (DRAFT / ACCEPTED /
//     WITHDRAWN) via it.each.
//   - Optional reason populates timeline payload + appends "Ditolak: <reason>"
//     to notes.
//   - Scope rejection — non-grant role throws FORBIDDEN.
//
// Cycle: docs/cycles/2026-05-10-p2-admission-funnel-ui-review.md (T5)

import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdmissionStatus } from "@/lib/generated/prisma/enums";
import type { SessionContext } from "@/lib/auth/session";

vi.mock("@/lib/db", () => ({ prisma: {} }));

import { rejectAdmission } from "../reject";

type AdmissionRow = {
  id: string;
  tenantId: string;
  status: AdmissionStatus;
  decidedAt: Date | null;
  notes: string | null;
};

function makePrismaMock(opts: {
  seedStatus?: AdmissionStatus;
  seedNotes?: string | null;
  admissionId?: string;
  tenantId?: string;
} = {}) {
  const id = opts.admissionId ?? "adm_1";
  const tenantId = opts.tenantId ?? "t_demo";
  const admissions: AdmissionRow[] = [
    {
      id,
      tenantId,
      status: opts.seedStatus ?? AdmissionStatus.SUBMITTED,
      decidedAt: null,
      notes: opts.seedNotes ?? null,
    },
  ];
  const auditRows: Array<Record<string, unknown>> = [];
  const timelineRows: Array<Record<string, unknown>> = [];
  let nextOtherId = 1;

  const admission = {
    findFirst: vi.fn(
      async (args: { where: { id: string; tenantId: string } }) => {
        const r = admissions.find(
          (a) => a.id === args.where.id && a.tenantId === args.where.tenantId,
        );
        if (!r) return null;
        return { id: r.id, status: r.status, notes: r.notes };
      },
    ),
    update: vi.fn(
      async (args: {
        where: { id: string };
        data: {
          status: AdmissionStatus;
          decidedAt: Date;
          notes: string | null;
        };
      }) => {
        const r = admissions.find((a) => a.id === args.where.id);
        if (!r) throw new Error("not_found");
        r.status = args.data.status;
        r.decidedAt = args.data.decidedAt;
        r.notes = args.data.notes;
        return { id: r.id, status: r.status, decidedAt: r.decidedAt };
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
    $transaction: vi.fn(
      async (fn: (txClient: typeof tx) => Promise<unknown>) => fn(tx),
    ),
  };

  return { prisma, tx, admissions, auditRows, timelineRows };
}

const ADMIN_SESSION: SessionContext = {
  tenantId: "t_demo",
  userId: "u_admin",
  supabaseUserId: "sb_admin",
  role: "admin",
  currentTermId: "term_1",
};

const PARENT_SESSION: SessionContext = {
  tenantId: "t_demo",
  userId: "u_parent",
  supabaseUserId: "sb_parent",
  role: "parent",
  currentTermId: "term_1",
};

const BASE_INPUT = {
  admissionId: "adm_1",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("rejectAdmission", () => {
  it("happy path: SUBMITTED → REJECTED, writes audit + timeline + decidedAt", async () => {
    const m = makePrismaMock({ seedStatus: AdmissionStatus.SUBMITTED });
    const result = await rejectAdmission(
      m.prisma as never,
      ADMIN_SESSION,
      BASE_INPUT,
    );

    expect(m.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(m.tx.admission.findFirst).toHaveBeenCalledTimes(1);
    expect(m.tx.admission.update).toHaveBeenCalledTimes(1);
    expect(m.admissions[0].status).toBe(AdmissionStatus.REJECTED);
    expect(m.admissions[0].decidedAt).toBeInstanceOf(Date);
    expect(result.status).toBe(AdmissionStatus.REJECTED);
    expect(result.previousStatus).toBe(AdmissionStatus.SUBMITTED);
    expect(result.emailLogId).toBeNull();

    expect(m.auditRows).toHaveLength(1);
    expect(m.auditRows[0]).toMatchObject({
      action: "UPDATE",
      resource: "Admission",
      actorUserId: "u_admin",
    });
    expect(m.timelineRows).toHaveLength(1);
    expect(m.timelineRows[0]).toMatchObject({
      kind: "admission.status-changed",
      subjectKind: "Admission",
    });
  });

  it.each([
    AdmissionStatus.SUBMITTED,
    AdmissionStatus.UNDER_REVIEW,
    AdmissionStatus.INTERVIEW_SCHEDULED,
    AdmissionStatus.OFFER_EXTENDED,
  ])("legal source %s → REJECTED succeeds", async (source) => {
    const m = makePrismaMock({ seedStatus: source });
    const result = await rejectAdmission(
      m.prisma as never,
      ADMIN_SESSION,
      BASE_INPUT,
    );
    expect(result.status).toBe(AdmissionStatus.REJECTED);
    expect(result.previousStatus).toBe(source);
    expect(m.admissions[0].status).toBe(AdmissionStatus.REJECTED);
  });

  it.each([
    AdmissionStatus.DRAFT,
    AdmissionStatus.ACCEPTED,
    AdmissionStatus.WITHDRAWN,
  ])("illegal source %s → REJECTED throws INVALID_TRANSITION", async (source) => {
    const m = makePrismaMock({ seedStatus: source });
    await expect(
      rejectAdmission(m.prisma as never, ADMIN_SESSION, BASE_INPUT),
    ).rejects.toThrow(/INVALID_TRANSITION/);
    // Row unchanged + no audit / timeline writes from a rejected transition.
    expect(m.admissions[0].status).toBe(source);
    expect(m.auditRows).toHaveLength(0);
    expect(m.timelineRows).toHaveLength(0);
  });

  it("optional reason populates timeline payload + appends 'Ditolak: <reason>' to notes", async () => {
    const m = makePrismaMock({
      seedStatus: AdmissionStatus.UNDER_REVIEW,
      seedNotes: "catatan awal",
    });
    await rejectAdmission(m.prisma as never, ADMIN_SESSION, {
      ...BASE_INPUT,
      reason: "Tidak memenuhi kuota",
    });

    expect(m.admissions[0].notes).toBe(
      "catatan awal\nDitolak: Tidak memenuhi kuota",
    );
    expect(m.timelineRows[0]).toMatchObject({
      kind: "admission.status-changed",
      payload: {
        from: AdmissionStatus.UNDER_REVIEW,
        to: AdmissionStatus.REJECTED,
        reason: "Tidak memenuhi kuota",
      },
    });
  });

  it("scope rejection: parent role throws FORBIDDEN before any DB roundtrip", async () => {
    const m = makePrismaMock({ seedStatus: AdmissionStatus.SUBMITTED });
    await expect(
      rejectAdmission(m.prisma as never, PARENT_SESSION, BASE_INPUT),
    ).rejects.toThrow(/FORBIDDEN/);
    expect(m.prisma.$transaction).not.toHaveBeenCalled();
    expect(m.tx.admission.findFirst).not.toHaveBeenCalled();
    expect(m.auditRows).toHaveLength(0);
    expect(m.timelineRows).toHaveLength(0);
  });
});
