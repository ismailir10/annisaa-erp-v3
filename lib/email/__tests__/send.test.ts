// @vitest-environment node
//
// Unit tests for sendEmail stub + admission-submitted template render.
//
// Cycle: docs/cycles/2026-05-10-p2-admission-funnel-ui-public.md (T5)

import { beforeEach, describe, expect, it, vi } from "vitest";

import { sendEmail } from "../send";
import {
  render,
  subject,
  type AdmissionSubmittedData,
} from "../templates/admission-submitted";

function makePrismaMock() {
  const rows: Array<Record<string, unknown>> = [];
  let nextId = 1;
  const create = vi.fn(async (args: { data: Record<string, unknown> }) => {
    const row = { id: `el${nextId++}`, ...args.data };
    rows.push(row);
    return { id: row.id };
  });
  return {
    rows,
    create,
    prisma: { emailLog: { create } },
  };
}

const SAMPLE_DATA: AdmissionSubmittedData = {
  trackingCode: "ABC12345",
  parentDisplayName: "Nur Hidayah",
  applicantFullName: "Aisyah Nur Hasan",
  tenantDisplayName: "Annisaa PAUD",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("admission-submitted template", () => {
  it("subject includes the applicant full name", () => {
    expect(subject(SAMPLE_DATA)).toContain("Aisyah Nur Hasan");
  });

  it("body greets in Indonesian + Bu Nur voice (Assalamu'alaikum opener)", () => {
    const body = render(SAMPLE_DATA);
    expect(body.startsWith("Assalamu'alaikum")).toBe(true);
  });

  it("body embeds the tracking code so the parent can look up status later", () => {
    const body = render(SAMPLE_DATA);
    expect(body).toContain("ABC12345");
  });

  it("body addresses parent by display name + names the school", () => {
    const body = render(SAMPLE_DATA);
    expect(body).toContain("Nur Hidayah");
    expect(body).toContain("Annisaa PAUD");
  });
});

describe("sendEmail", () => {
  it("writes one EmailLog row with status=QUEUED and the rendered subject", async () => {
    const m = makePrismaMock();
    const result = await sendEmail(m.prisma as never, {
      tenantId: "t_demo",
      recipientEmail: "ibu.nur@example.com",
      template: "admission-submitted",
      data: SAMPLE_DATA,
    });

    expect(result.status).toBe("QUEUED");
    expect(result.emailLogId).toBe("el1");
    expect(m.create).toHaveBeenCalledTimes(1);
    expect(m.rows).toHaveLength(1);
    expect(m.rows[0]).toMatchObject({
      tenantId: "t_demo",
      recipientEmail: "ibu.nur@example.com",
      template: "admission-submitted",
      status: "QUEUED",
      subject: subject(SAMPLE_DATA),
    });
  });

  it("records actorUserId when supplied", async () => {
    const m = makePrismaMock();
    await sendEmail(m.prisma as never, {
      tenantId: "t_demo",
      recipientEmail: "ibu.nur@example.com",
      template: "admission-submitted",
      data: SAMPLE_DATA,
      actorUserId: "u_admin",
    });
    expect(m.rows[0]).toMatchObject({
      createdById: "u_admin",
      updatedById: "u_admin",
    });
  });

  it("defaults actorUserId to null for system-emitted (e.g. public submit)", async () => {
    const m = makePrismaMock();
    await sendEmail(m.prisma as never, {
      tenantId: "t_demo",
      recipientEmail: "ibu.nur@example.com",
      template: "admission-submitted",
      data: SAMPLE_DATA,
    });
    expect(m.rows[0]).toMatchObject({
      createdById: null,
      updatedById: null,
    });
  });
});
