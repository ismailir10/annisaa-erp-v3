// @vitest-environment node
//
// Render-shape tests for the new admission-decision templates registered
// in T7 (admission-accepted + admission-rejected). Subject + body must
// be plain strings; key data points (tracking code, student/applicant
// name, tenant name) MUST appear verbatim in the body so a Resend cycle
// or a parent-readable HTML wrap can rely on them.
//
// Cycle: docs/cycles/2026-05-10-p2-admission-funnel-ui-review.md (T7)

import { describe, expect, it } from "vitest";

import { renderEmail, TEMPLATES } from "../templates";

describe("admission-accepted template", () => {
  it("registered in the typed-slug barrel", () => {
    expect(TEMPLATES["admission-accepted"]).toBeDefined();
    expect(typeof TEMPLATES["admission-accepted"].subject).toBe("function");
    expect(typeof TEMPLATES["admission-accepted"].render).toBe("function");
  });

  it("subject + body render with tracking code, student name, and tenant", () => {
    const r = renderEmail("admission-accepted", {
      trackingCode: "ABCD1234",
      parentDisplayName: "Hasan",
      studentFullName: "Aisyah Nur Hasan",
      tenantDisplayName: "Annisaa PAUD",
    });
    expect(typeof r.subject).toBe("string");
    expect(typeof r.body).toBe("string");
    expect(r.subject).toContain("Aisyah Nur Hasan");
    expect(r.subject).toContain("Annisaa PAUD");
    expect(r.body).toContain("ABCD1234");
    expect(r.body).toContain("Aisyah Nur Hasan");
    expect(r.body).toContain("Annisaa PAUD");
    expect(r.body).toContain("Hasan");
    // Bu Nur voice — Assalamu'alaikum opener (standards/voice.md persona).
    expect(r.body).toContain("Assalamu'alaikum");
    // Next-steps stub (MPLS / Akta Kelahiran) per spec AC4.
    expect(r.body).toContain("MPLS");
    expect(r.body).toContain("Akta Kelahiran");
  });
});

describe("admission-rejected template", () => {
  it("registered in the typed-slug barrel", () => {
    expect(TEMPLATES["admission-rejected"]).toBeDefined();
    expect(typeof TEMPLATES["admission-rejected"].subject).toBe("function");
    expect(typeof TEMPLATES["admission-rejected"].render).toBe("function");
  });

  it("subject + body render politely with tracking code + applicant name", () => {
    const r = renderEmail("admission-rejected", {
      trackingCode: "WXYZ9999",
      parentDisplayName: "Hasan",
      applicantFullName: "Aisyah Nur Hasan",
      tenantDisplayName: "Annisaa PAUD",
    });
    expect(typeof r.subject).toBe("string");
    expect(typeof r.body).toBe("string");
    expect(r.subject).toContain("Aisyah Nur Hasan");
    expect(r.body).toContain("WXYZ9999");
    expect(r.body).toContain("Aisyah Nur Hasan");
    expect(r.body).toContain("Annisaa PAUD");
    expect(r.body).toContain("Hasan");
    expect(r.body).toContain("Assalamu'alaikum");
    // No specific reason — spec assumption (admin can edit Admission.notes
    // for free-text override; template intentionally generic).
    expect(r.body).not.toContain("alasan");
  });
});
