// Unit tests for emitTimelineEvent (lib/timeline/emit.ts).
//
// Mocked-prisma tests covering: registry lookup, payload Zod validation,
// subjectKind resolution (polymorphic + mismatch guard), visibility default
// + override, tx threading, occurredAt override, required-field validation.
//
// Cycle: docs/cycles/2026-05-06-p1-timeline-registry.md
import { beforeEach, describe, expect, it, vi } from "vitest";

const { timelineCreateMock } = vi.hoisted(() => ({
  timelineCreateMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    timelineEvent: {
      create: timelineCreateMock,
    },
  },
}));

import { emitTimelineEvent } from "../emit";

const baseInput = {
  tenantId: "t_1",
  actorUserId: "u_1",
  kind: "student.admitted" as const,
  subjectId: "stu_1",
  payload: {},
};

beforeEach(() => {
  timelineCreateMock.mockReset();
  timelineCreateMock.mockResolvedValue({ id: "evt_1" });
});

describe("emitTimelineEvent — happy path", () => {
  it("calls prisma.timelineEvent.create once with registry-resolved subjectKind + default visibility", async () => {
    await emitTimelineEvent(baseInput);

    expect(timelineCreateMock).toHaveBeenCalledTimes(1);
    const data = timelineCreateMock.mock.calls[0][0].data;
    expect(data).toMatchObject({
      tenantId: "t_1",
      actorUserId: "u_1",
      kind: "student.admitted",
      subjectKind: "Student",
      subjectId: "stu_1",
      visibility: "PARENT_VISIBLE",
      payload: {},
    });
    expect(data.occurredAt).toBeUndefined();
  });
});

describe("emitTimelineEvent — registry lookup", () => {
  it("throws on unknown kind; prisma.create not called", async () => {
    await expect(
      emitTimelineEvent({
        ...baseInput,
        // biome-ignore lint/suspicious/noExplicitAny: testing invalid input
        kind: "nope.notreal" as any,
      }),
    ).rejects.toThrow(/unknown kind 'nope\.notreal'/);
    expect(timelineCreateMock).not.toHaveBeenCalled();
  });
});

describe("emitTimelineEvent — payload Zod validation", () => {
  it("accepts valid optional fields for student.admitted", async () => {
    await emitTimelineEvent({
      ...baseInput,
      payload: { programId: "prg_1", admittedAt: "2026-05-06" },
    });
    expect(timelineCreateMock).toHaveBeenCalledTimes(1);
  });

  it("accepts payload {} on student.soft-deleted (strict-empty schema; load-bearing for T3 bridge)", async () => {
    await emitTimelineEvent({
      ...baseInput,
      kind: "student.soft-deleted",
      payload: {},
    });
    expect(timelineCreateMock).toHaveBeenCalledTimes(1);
    expect(timelineCreateMock.mock.calls[0][0].data.payload).toEqual({});
  });

  it("rejects empty text on note.added (min(1) fails)", async () => {
    await expect(
      emitTimelineEvent({
        ...baseInput,
        kind: "note.added",
        subjectKind: "Invoice",
        // biome-ignore lint/suspicious/noExplicitAny: testing invalid input
        payload: { text: "" } as any,
      }),
    ).rejects.toThrow();
    expect(timelineCreateMock).not.toHaveBeenCalled();
  });
});

describe("emitTimelineEvent — visibility resolution", () => {
  it("uses registry default when input.visibility omitted", async () => {
    await emitTimelineEvent({
      ...baseInput,
      kind: "employee.terminated",
      // biome-ignore lint/suspicious/noExplicitAny: shape mismatch in test
      payload: {} as any,
    });
    expect(timelineCreateMock.mock.calls[0][0].data.visibility).toBe("PRIVATE");
  });

  it("respects caller override", async () => {
    await emitTimelineEvent({
      ...baseInput,
      visibility: "INTERNAL",
    });
    expect(timelineCreateMock.mock.calls[0][0].data.visibility).toBe("INTERNAL");
  });
});

describe("emitTimelineEvent — transaction threading", () => {
  it("uses tx.timelineEvent.create when tx is provided; top-level prisma not called", async () => {
    const txCreate = vi.fn().mockResolvedValue({ id: "evt_tx_1" });
    const tx = { timelineEvent: { create: txCreate } } as unknown as Parameters<
      typeof emitTimelineEvent
    >[1];

    await emitTimelineEvent(baseInput, tx);

    expect(txCreate).toHaveBeenCalledTimes(1);
    expect(timelineCreateMock).not.toHaveBeenCalled();
  });
});

describe("emitTimelineEvent — required-field validation (synchronous, pre-DB)", () => {
  it.each([
    ["tenantId", { tenantId: "" }],
    ["kind", { kind: "" as unknown as typeof baseInput.kind }],
    ["subjectId", { subjectId: "" }],
  ])("throws when %s is missing — prisma.create not called", async (_field, override) => {
    await expect(
      emitTimelineEvent({ ...baseInput, ...override }),
    ).rejects.toThrow(/is required/);
    expect(timelineCreateMock).not.toHaveBeenCalled();
  });
});

describe("emitTimelineEvent — occurredAt override", () => {
  it("forwards explicit occurredAt to prisma.create instead of letting DB default", async () => {
    const fixed = new Date("2026-01-15T08:30:00.000Z");
    await emitTimelineEvent({ ...baseInput, occurredAt: fixed });
    expect(timelineCreateMock.mock.calls[0][0].data.occurredAt).toBe(fixed);
  });
});

describe("emitTimelineEvent — polymorphic subject (note.added)", () => {
  it("uses input.subjectKind when registry sentinel is '*'", async () => {
    await emitTimelineEvent({
      ...baseInput,
      kind: "note.added",
      subjectKind: "Invoice",
      subjectId: "inv_1",
      payload: { text: "Late payment recorded" },
    });
    expect(timelineCreateMock.mock.calls[0][0].data.subjectKind).toBe("Invoice");
  });

  it("throws when polymorphic kind is emitted without input.subjectKind", async () => {
    await expect(
      emitTimelineEvent({
        ...baseInput,
        kind: "note.added",
        // subjectKind intentionally omitted
        payload: { text: "x" },
      }),
    ).rejects.toThrow(/polymorphic/);
    expect(timelineCreateMock).not.toHaveBeenCalled();
  });
});

describe("emitTimelineEvent — non-polymorphic subjectKind mismatch guard", () => {
  it("throws when caller's subjectKind differs from the registry value", async () => {
    await expect(
      emitTimelineEvent({
        ...baseInput,
        kind: "student.admitted",
        subjectKind: "Invoice", // registry says "Student"
      }),
    ).rejects.toThrow(/subjectKind mismatch/);
    expect(timelineCreateMock).not.toHaveBeenCalled();
  });

  it("accepts a caller-supplied subjectKind that matches the registry value", async () => {
    await emitTimelineEvent({
      ...baseInput,
      kind: "student.admitted",
      subjectKind: "Student",
    });
    expect(timelineCreateMock).toHaveBeenCalledTimes(1);
    expect(timelineCreateMock.mock.calls[0][0].data.subjectKind).toBe("Student");
  });
});
