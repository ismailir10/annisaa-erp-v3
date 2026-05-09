// @vitest-environment node
//
// Unit tests for withdrawAdmission. Mocks the prisma client + tx callback so
// we exercise the orchestration without a live DB. Verifies:
//   - happy path SUBMITTED → WITHDRAWN updates row + returns previousStatus.
//   - all 5 non-terminal source states transition cleanly to WITHDRAWN.
//   - terminal source state (ACCEPTED) → throws INVALID_TRANSITION.
//   - reason populates timeline payload AND appends "Tarik kembali: <reason>"
//     to the Admission.notes column.
//   - non-admin role (parent) → throws FORBIDDEN before tx runs.
//
// Cycle: docs/cycles/2026-05-10-p2-admission-funnel-ui-review.md (T4)

import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdmissionStatus } from "@/lib/generated/prisma/enums";
import type { SessionContext } from "@/lib/auth/session";

vi.mock("@/lib/db", () => ({ prisma: {} }));

import { withdrawAdmission } from "../withdraw";

type AdmissionRow = {
  id: string;
  tenantId: string;
  status: AdmissionStatus;
  notes: string | null;
  decidedAt: Date | null;
  deletedAt: Date | null;
};

function makePrismaMock(opts: {
  seed: { status: AdmissionStatus; notes?: string | null };
  admissionId?: string;
  tenantId?: string;
}) {
  const tenantId = opts.tenantId ?? "t_demo";
  const id = opts.admissionId ?? "adm_1_abcdefghij";
  const admissions: AdmissionRow[] = [
    {
      id,
      tenantId,
      status: opts.seed.status,
      notes: opts.seed.notes ?? null,
      decidedAt: null,
      deletedAt: null,
    },
  ];
  const auditRows: Array<Record<string, unknown>> = [];
  const timelineRows: Array<Record<string, unknown>> = [];
  let nextOtherId = 1;

  const admission = {
    findFirst: vi.fn(
      async (args: {
        where: { id: string; tenantId: string; deletedAt: null };
        select?: Record<string, true>;
      }) => {
        const r = admissions.find(
          (a) =>
            a.id === args.where.id &&
            a.tenantId === args.where.tenantId &&
            a.deletedAt === null,
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
          notes?: string | null;
        };
      }) => {
        const r = admissions.find((a) => a.id === args.where.id);
        if (!r) throw new Error("not_found");
        r.status = args.data.status;
        r.decidedAt = args.data.decidedAt;
        if (args.data.notes !== undefined) r.notes = args.data.notes;
        return {
          id: r.id,
          status: r.status,
          decidedAt: r.decidedAt,
          notes: r.notes,
        };
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
    $transaction: vi.fn(async (fn: (txClient: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
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
  supabaseUserId: "sup_parent",
  role: "parent",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("withdrawAdmission", () => {
  it("transitions SUBMITTED → WITHDRAWN and returns previousStatus=SUBMITTED", async () => {
    const m = makePrismaMock({ seed: { status: AdmissionStatus.SUBMITTED } });
    const result = await withdrawAdmission(m.prisma as never, ADMIN_SESSION, {
      admissionId: "adm_1_abcdefghij",
    });

    expect(m.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(m.tx.admission.findFirst).toHaveBeenCalledTimes(1);
    expect(m.tx.admission.update).toHaveBeenCalledTimes(1);
    expect(m.admissions[0].status).toBe(AdmissionStatus.WITHDRAWN);
    expect(m.admissions[0].decidedAt).toBeInstanceOf(Date);
    expect(result.status).toBe(AdmissionStatus.WITHDRAWN);
    expect(result.previousStatus).toBe(AdmissionStatus.SUBMITTED);
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
    AdmissionStatus.DRAFT,
    AdmissionStatus.UNDER_REVIEW,
    AdmissionStatus.INTERVIEW_SCHEDULED,
    AdmissionStatus.OFFER_EXTENDED,
  ])("transitions %s → WITHDRAWN cleanly", async (sourceStatus) => {
    const m = makePrismaMock({ seed: { status: sourceStatus } });
    const result = await withdrawAdmission(m.prisma as never, ADMIN_SESSION, {
      admissionId: "adm_1_abcdefghij",
    });
    expect(result.status).toBe(AdmissionStatus.WITHDRAWN);
    expect(result.previousStatus).toBe(sourceStatus);
    expect(m.admissions[0].status).toBe(AdmissionStatus.WITHDRAWN);
    expect(m.timelineRows).toHaveLength(1);
    const payload = m.timelineRows[0].payload as { from: string; to: string };
    expect(payload.from).toBe(sourceStatus);
    expect(payload.to).toBe(AdmissionStatus.WITHDRAWN);
  });

  it("throws INVALID_TRANSITION when source state is terminal (ACCEPTED)", async () => {
    const m = makePrismaMock({ seed: { status: AdmissionStatus.ACCEPTED } });
    await expect(
      withdrawAdmission(m.prisma as never, ADMIN_SESSION, {
        admissionId: "adm_1_abcdefghij",
      }),
    ).rejects.toThrow(/INVALID_TRANSITION/);
    // Update never reached.
    expect(m.tx.admission.update).not.toHaveBeenCalled();
    expect(m.auditRows).toHaveLength(0);
    expect(m.timelineRows).toHaveLength(0);
  });

  it("appends reason to notes and surfaces it in timeline payload", async () => {
    const m = makePrismaMock({
      seed: {
        status: AdmissionStatus.SUBMITTED,
        notes: "Catatan awal admin.",
      },
    });
    const reason = "Keluarga pindah kota.";
    await withdrawAdmission(m.prisma as never, ADMIN_SESSION, {
      admissionId: "adm_1_abcdefghij",
      reason,
    });

    expect(m.admissions[0].notes).toBe(
      `Catatan awal admin.\nTarik kembali: ${reason}`,
    );
    expect(m.timelineRows).toHaveLength(1);
    const payload = m.timelineRows[0].payload as {
      from: string;
      to: string;
      reason?: string;
    };
    expect(payload.reason).toBe(reason);
    // Audit before/after captures the notes diff.
    const audit = m.auditRows[0] as {
      before: { notes: string | null };
      after: { notes: string | null };
    };
    expect(audit.before.notes).toBe("Catatan awal admin.");
    expect(audit.after.notes).toBe(
      `Catatan awal admin.\nTarik kembali: ${reason}`,
    );
  });

  it("rejects parent role with FORBIDDEN before the tx runs", async () => {
    const m = makePrismaMock({ seed: { status: AdmissionStatus.SUBMITTED } });
    await expect(
      withdrawAdmission(m.prisma as never, PARENT_SESSION, {
        admissionId: "adm_1_abcdefghij",
      }),
    ).rejects.toThrow(/FORBIDDEN/);
    expect(m.prisma.$transaction).not.toHaveBeenCalled();
    expect(m.tx.admission.findFirst).not.toHaveBeenCalled();
    expect(m.auditRows).toHaveLength(0);
    expect(m.timelineRows).toHaveLength(0);
  });
});
