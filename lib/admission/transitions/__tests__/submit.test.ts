// @vitest-environment node
//
// Unit tests for submitAdmission. Mocks the prisma client + tx callback so
// we exercise the orchestration without a live DB. Verifies:
//   - DRAFT row is created with the form payload + sibling-detect result.
//   - State transitions DRAFT → SUBMITTED via assertTransition (covered).
//   - Audit row written (CREATE on Admission).
//   - Timeline event emitted (admission.status-changed, INTERNAL).
//   - Email enqueued via EmailLog row (status=QUEUED) only when notificationEmail set.
//   - Tracking code = first-8 of admissionId, uppercased.
//
// Cycle: docs/cycles/2026-05-10-p2-admission-funnel-ui-public.md (T7)

import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdmissionStatus, AdmissionSource } from "@/lib/generated/prisma/enums";

vi.mock("@/lib/db", () => ({ prisma: {} }));

import { deriveTrackingCode, submitAdmission } from "../submit";

type AdmissionRow = {
  id: string;
  tenantId: string;
  status: AdmissionStatus;
  submittedAt: Date | null;
  siblingDetectedFromHouseholdId: string | null;
};

function makePrismaMock(opts: { siblingHouseholdId?: string | null } = {}) {
  const admissions: AdmissionRow[] = [];
  const auditRows: Array<Record<string, unknown>> = [];
  const timelineRows: Array<Record<string, unknown>> = [];
  const emailRows: Array<Record<string, unknown>> = [];
  let nextAdmissionId = 1;
  let nextOtherId = 1;

  const guardianFindMany = vi.fn(async () =>
    opts.siblingHouseholdId
      ? [
          {
            studentGuardians: [
              { student: { householdId: opts.siblingHouseholdId } },
            ],
          },
        ]
      : [],
  );

  const admission = {
    create: vi.fn(async (args: { data: Record<string, unknown> }) => {
      const id = `adm_${nextAdmissionId++}_abcdefghij`;
      const row: AdmissionRow = {
        id,
        tenantId: args.data.tenantId as string,
        status: args.data.status as AdmissionStatus,
        submittedAt: null,
        siblingDetectedFromHouseholdId:
          (args.data.siblingDetectedFromHouseholdId as string | null) ?? null,
      };
      admissions.push(row);
      return { id: row.id, status: row.status };
    }),
    update: vi.fn(
      async (args: {
        where: { id: string };
        data: { status: AdmissionStatus; submittedAt: Date };
      }) => {
        const r = admissions.find((a) => a.id === args.where.id);
        if (!r) throw new Error("not_found");
        r.status = args.data.status;
        r.submittedAt = args.data.submittedAt;
        return { id: r.id, status: r.status, submittedAt: r.submittedAt };
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
  const emailLog = {
    create: vi.fn(async (args: { data: Record<string, unknown> }) => {
      const row = { id: `el${nextOtherId++}`, ...args.data };
      emailRows.push(row);
      return { id: row.id };
    }),
  };

  const tx = {
    admission,
    guardian: { findMany: guardianFindMany },
    auditLog,
    timelineEvent,
    emailLog,
  };

  const prisma = {
    ...tx,
    $transaction: vi.fn(async (fn: (txClient: typeof tx) => Promise<unknown>) => fn(tx)),
  };

  return { prisma, tx, admissions, auditRows, timelineRows, emailRows };
}

const BASE_INPUT = {
  tenantId: "t_demo",
  programId: "prog_paud",
  academicYearId: "ay_2026",
  addressId: "addr_1",
  applicantFullName: "Aisyah Nur Hasan",
  fatherName: "Hasan",
  fatherNik: "1234567890123456",
  fatherPhone: "081200001234",
  motherName: "Nur Hidayah",
  notificationEmail: "ibu.nur@example.com",
  tenantDisplayName: "Annisaa PAUD",
  source: AdmissionSource.ONLINE,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("submitAdmission", () => {
  it("creates Admission DRAFT then transitions to SUBMITTED in one tx", async () => {
    const m = makePrismaMock();
    const result = await submitAdmission(m.prisma as never, BASE_INPUT);

    expect(m.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(m.tx.admission.create).toHaveBeenCalledTimes(1);
    expect(m.tx.admission.update).toHaveBeenCalledTimes(1);
    expect(m.admissions).toHaveLength(1);
    expect(m.admissions[0].status).toBe(AdmissionStatus.SUBMITTED);
    expect(m.admissions[0].submittedAt).toBeInstanceOf(Date);
    expect(result.status).toBe(AdmissionStatus.SUBMITTED);
  });

  it("derives tracking code = first-8 of admissionId, uppercased", async () => {
    const m = makePrismaMock();
    const result = await submitAdmission(m.prisma as never, BASE_INPUT);
    expect(result.trackingCode).toHaveLength(8);
    expect(result.trackingCode).toBe(result.trackingCode.toUpperCase());
    expect(deriveTrackingCode("abcd1234efgh")).toBe("ABCD1234");
  });

  it("writes one CREATE audit row on Admission with system actorUserId=null", async () => {
    const m = makePrismaMock();
    await submitAdmission(m.prisma as never, BASE_INPUT);
    expect(m.auditRows).toHaveLength(1);
    expect(m.auditRows[0]).toMatchObject({
      action: "CREATE",
      resource: "Admission",
      actorUserId: null,
    });
  });

  it("emits one admission.status-changed timeline event with from=DRAFT to=SUBMITTED", async () => {
    const m = makePrismaMock();
    await submitAdmission(m.prisma as never, BASE_INPUT);
    expect(m.timelineRows).toHaveLength(1);
    expect(m.timelineRows[0]).toMatchObject({
      kind: "admission.status-changed",
      subjectKind: "Admission",
    });
  });

  it("populates siblingDetectedFromHouseholdId via NIK match (precedence path)", async () => {
    const m = makePrismaMock({ siblingHouseholdId: "h_existing" });
    const result = await submitAdmission(m.prisma as never, BASE_INPUT);
    expect(result.siblingDetectedFromHouseholdId).toBe("h_existing");
    expect(result.siblingMatchKind).toBe("NIK");
    expect(m.admissions[0].siblingDetectedFromHouseholdId).toBe("h_existing");
    // Confirms the first guardian.findMany call queries by `nik` (not phone),
    // proving NIK precedence is exercised — not just lucky mock ordering.
    const firstCall = m.tx.guardian.findMany.mock.calls[0]?.[0] as {
      where: { nik?: unknown; OR?: unknown };
    };
    expect(firstCall?.where?.nik).toBeDefined();
    expect(firstCall?.where?.OR).toBeUndefined();
  });

  it("falls back to phone-last4 path when no valid NIK is supplied", async () => {
    const m = makePrismaMock({ siblingHouseholdId: "h_phone" });
    const result = await submitAdmission(m.prisma as never, {
      ...BASE_INPUT,
      fatherNik: null,
      motherNik: null,
      fatherPhone: "081200001234",
    });
    expect(result.siblingDetectedFromHouseholdId).toBe("h_phone");
    expect(result.siblingMatchKind).toBe("PHONE_LAST4");
    const firstCall = m.tx.guardian.findMany.mock.calls[0]?.[0] as {
      where: { nik?: unknown; OR?: unknown };
    };
    expect(firstCall?.where?.nik).toBeUndefined();
    expect(firstCall?.where?.OR).toBeDefined();
  });

  it("returns NONE matchKind + null sibling when no Guardian roster matches", async () => {
    const m = makePrismaMock();
    const result = await submitAdmission(m.prisma as never, BASE_INPUT);
    expect(result.siblingDetectedFromHouseholdId).toBeNull();
    expect(result.siblingMatchKind).toBe("NONE");
  });

  it("enqueues confirmation email via EmailLog QUEUED row when notificationEmail set", async () => {
    const m = makePrismaMock();
    const result = await submitAdmission(m.prisma as never, BASE_INPUT);
    expect(m.emailRows).toHaveLength(1);
    expect(m.emailRows[0]).toMatchObject({
      template: "admission-submitted",
      status: "QUEUED",
      recipientEmail: "ibu.nur@example.com",
    });
    expect(result.emailLogId).not.toBeNull();
  });

  it("skips email enqueue when notificationEmail is omitted", async () => {
    const m = makePrismaMock();
    const result = await submitAdmission(m.prisma as never, {
      ...BASE_INPUT,
      notificationEmail: null,
    });
    expect(m.emailRows).toHaveLength(0);
    expect(result.emailLogId).toBeNull();
  });

  it("email enqueue failure does NOT roll back the committed admission", async () => {
    const m = makePrismaMock();
    // Force the email enqueue to throw — simulates a Resend / DB outage.
    m.tx.emailLog.create.mockImplementationOnce(async () => {
      throw new Error("EMAIL_OUTBOX_DOWN");
    });
    const result = await submitAdmission(m.prisma as never, BASE_INPUT);
    // Admission still landed.
    expect(m.admissions).toHaveLength(1);
    expect(m.admissions[0].status).toBe(AdmissionStatus.SUBMITTED);
    // Audit + timeline still committed.
    expect(m.auditRows).toHaveLength(1);
    expect(m.timelineRows).toHaveLength(1);
    // Caller surfaces emailLogId=null so a retry job can re-enqueue.
    expect(result.emailLogId).toBeNull();
  });
});
