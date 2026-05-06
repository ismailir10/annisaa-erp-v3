// Unit tests for writeAuditLog (lib/audit/write.ts).
//
// Mocked-prisma tests covering: redaction integration, tx threading,
// validation guards, JSON-normalisation, null payloads, re-throw semantics.
// Live-DB trigger behaviour is exercised in append-only-trigger.test.ts
// (gated by TEST_DATABASE_URL).
//
// Spec: docs/superpowers/specs/2026-05-04-erp-rebuild-foundation-design.md §5.13
// Cycle: docs/cycles/2026-05-05-p1-audit-write-middleware.md
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock factories are hoisted above imports — share state via vi.hoisted.
const { createMock, timelineCreateMock, PRISMA_JSON_NULL } = vi.hoisted(() => ({
  createMock: vi.fn(),
  timelineCreateMock: vi.fn(),
  PRISMA_JSON_NULL: Symbol.for("Prisma.JsonNull-test"),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    auditLog: {
      create: createMock,
    },
    timelineEvent: {
      create: timelineCreateMock,
    },
  },
}));

vi.mock("@/lib/generated/prisma/client", () => ({
  AuditAction: {
    CREATE: "CREATE",
    UPDATE: "UPDATE",
    DELETE: "DELETE",
    SOFT_DELETE: "SOFT_DELETE",
    RESTORE: "RESTORE",
    READ: "READ",
    IMPORT: "IMPORT",
    EXPORT: "EXPORT",
  },
  TimelineVisibility: {
    PRIVATE: "PRIVATE",
    INTERNAL: "INTERNAL",
    PARENT_VISIBLE: "PARENT_VISIBLE",
  },
  Prisma: {
    JsonNull: PRISMA_JSON_NULL,
  },
}));

import { AuditAction } from "@/lib/generated/prisma/client";
import { writeAuditLog, type WriteAuditLogInput } from "../write";

const baseInput: WriteAuditLogInput = {
  tenantId: "t_1",
  actorUserId: "u_1",
  action: AuditAction.UPDATE,
  resource: "Employee",
  resourceId: "emp_1",
};

beforeEach(() => {
  createMock.mockReset();
  createMock.mockResolvedValue({ id: "audit_1" });
  timelineCreateMock.mockReset();
  timelineCreateMock.mockResolvedValue({ id: "evt_1" });
});

describe("writeAuditLog — happy path", () => {
  it("calls prisma.auditLog.create exactly once with the expected payload", async () => {
    await writeAuditLog({
      ...baseInput,
      before: { name: "Bu Sari" },
      after: { name: "Bu Sari A." },
    });

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock).toHaveBeenCalledWith({
      data: {
        tenantId: "t_1",
        actorUserId: "u_1",
        action: "UPDATE",
        resource: "Employee",
        resourceId: "emp_1",
        before: { name: "Bu Sari" },
        after: { name: "Bu Sari A." },
        ipAddress: null,
        userAgent: null,
      },
    });
  });

  it("forwards optional ipAddress + userAgent when provided", async () => {
    await writeAuditLog({
      ...baseInput,
      ipAddress: "10.0.0.5",
      userAgent: "Mozilla/5.0",
    });

    expect(createMock.mock.calls[0][0].data.ipAddress).toBe("10.0.0.5");
    expect(createMock.mock.calls[0][0].data.userAgent).toBe("Mozilla/5.0");
  });
});

describe("writeAuditLog — PII redaction integration", () => {
  it("redacts Employee.nik (policy: redact) and masks Employee.phone (policy: mask:last4) in before+after", async () => {
    await writeAuditLog({
      ...baseInput,
      before: { nik: "3275010101010001", phone: "+6281234567890", name: "Bu Sari" },
      after: { nik: "3275010101010002", phone: "+6289876543210", name: "Bu Sari" },
    });

    const data = createMock.mock.calls[0][0].data;
    expect(data.before).toEqual({ nik: null, phone: "***7890", name: "Bu Sari" });
    expect(data.after).toEqual({ nik: null, phone: "***3210", name: "Bu Sari" });
  });

  it("passes through unknown-resource payloads unchanged (redactor passthrough)", async () => {
    await writeAuditLog({
      ...baseInput,
      resource: "NotARealModel",
      before: { nik: "EXPOSED", phone: "+6281234567890" },
    });

    const data = createMock.mock.calls[0][0].data;
    expect(data.before).toEqual({ nik: "EXPOSED", phone: "+6281234567890" });
  });
});

describe("writeAuditLog — JSON normalisation", () => {
  it("converts Date instances in before to ISO strings (JSONB-safe)", async () => {
    const fixed = new Date("2026-05-05T12:00:00.000Z");
    await writeAuditLog({
      ...baseInput,
      resource: "OrgConfig",
      before: { startedAt: fixed, label: "v1" },
    });

    const data = createMock.mock.calls[0][0].data;
    expect(data.before).toEqual({
      startedAt: "2026-05-05T12:00:00.000Z",
      label: "v1",
    });
  });
});

describe("writeAuditLog — null payloads (CREATE / DELETE shapes)", () => {
  it("CREATE: before omitted → undefined → JSON before passthrough; after populated", async () => {
    await writeAuditLog({
      ...baseInput,
      action: AuditAction.CREATE,
      after: { name: "New Employee" },
    });

    const data = createMock.mock.calls[0][0].data;
    expect(data.before).toBeUndefined();
    expect(data.after).toEqual({ name: "New Employee" });
  });

  it("DELETE: before populated, after explicit null → mapped to Prisma.JsonNull sentinel", async () => {
    await writeAuditLog({
      ...baseInput,
      action: AuditAction.DELETE,
      before: { name: "Old Employee" },
      after: null,
    });

    const data = createMock.mock.calls[0][0].data;
    expect(data.before).toEqual({ name: "Old Employee" });
    expect(data.after).toBe(PRISMA_JSON_NULL);
  });
});

describe("writeAuditLog — required-field validation (synchronous, pre-DB)", () => {
  it("throws when tenantId is missing — prisma.create not called", async () => {
    await expect(
      writeAuditLog({ ...baseInput, tenantId: "" }),
    ).rejects.toThrow(/tenantId is required/);
    expect(createMock).not.toHaveBeenCalled();
  });

  it.each([
    ["action", { action: undefined as unknown as AuditAction }],
    ["resource", { resource: "" }],
    ["resourceId", { resourceId: "" }],
  ])("throws when %s is missing — prisma.create not called", async (_field, override) => {
    await expect(
      writeAuditLog({ ...baseInput, ...override } as WriteAuditLogInput),
    ).rejects.toThrow(/is required/);
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe("writeAuditLog — transaction threading (spec §5.13)", () => {
  it("calls tx.auditLog.create when tx arg provided — does NOT call top-level prisma", async () => {
    const txCreate = vi.fn().mockResolvedValue({ id: "audit_tx_1" });
    const tx = { auditLog: { create: txCreate } } as unknown as Parameters<
      typeof writeAuditLog
    >[1];

    await writeAuditLog(baseInput, tx);

    expect(txCreate).toHaveBeenCalledTimes(1);
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe("writeAuditLog — re-throw semantics (no silent swallow)", () => {
  it("propagates underlying prisma.create rejection unchanged", async () => {
    const dbError = new Error("connection lost");
    createMock.mockRejectedValueOnce(dbError);

    await expect(writeAuditLog(baseInput)).rejects.toBe(dbError);
  });
});

describe("writeAuditLog — timeline bridge (p1-timeline-registry)", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("SOFT_DELETE on Student emits student.soft-deleted (audit + timeline both fire)", async () => {
    await writeAuditLog({
      ...baseInput,
      action: AuditAction.SOFT_DELETE,
      resource: "Student",
      resourceId: "stu_1",
    });

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(timelineCreateMock).toHaveBeenCalledTimes(1);
    const data = timelineCreateMock.mock.calls[0][0].data;
    expect(data).toMatchObject({
      tenantId: "t_1",
      actorUserId: "u_1",
      kind: "student.soft-deleted",
      subjectKind: "Student",
      subjectId: "stu_1",
      visibility: "INTERNAL",
      payload: {},
    });
  });

  it("RESTORE on Student emits student.restored", async () => {
    await writeAuditLog({
      ...baseInput,
      action: AuditAction.RESTORE,
      resource: "Student",
      resourceId: "stu_1",
    });

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(timelineCreateMock).toHaveBeenCalledTimes(1);
    expect(timelineCreateMock.mock.calls[0][0].data.kind).toBe(
      "student.restored",
    );
  });

  it("UPDATE on Student does NOT emit timeline event (action-gated)", async () => {
    await writeAuditLog({
      ...baseInput,
      action: AuditAction.UPDATE,
      resource: "Student",
      resourceId: "stu_1",
    });

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(timelineCreateMock).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("SOFT_DELETE on unmapped resource does NOT emit and does NOT warn (resource-gated)", async () => {
    await writeAuditLog({
      ...baseInput,
      action: AuditAction.SOFT_DELETE,
      resource: "NotInMap",
      resourceId: "x_1",
    });

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(timelineCreateMock).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("RESTORE on Employee (mapped resource, partial coverage) does NOT emit and warns", async () => {
    await writeAuditLog({
      ...baseInput,
      action: AuditAction.RESTORE,
      resource: "Employee",
      resourceId: "emp_1",
    });

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(timelineCreateMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Employee.RESTORE has no timeline kind registered"),
    );
  });
});
