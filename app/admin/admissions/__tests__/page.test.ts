import { describe, expect, it } from "vitest";

import { canConvertAdmissionToStudent } from "../page";

describe("AdmissionsPage row actions", () => {
  it("only offers conversion after an admission is accepted", () => {
    expect(canConvertAdmissionToStudent("INQUIRY")).toBe(false);
    expect(canConvertAdmissionToStudent("VISIT_SCHEDULED")).toBe(false);
    expect(canConvertAdmissionToStudent("VISITED")).toBe(false);
    expect(canConvertAdmissionToStudent("CANCELLED")).toBe(false);
    expect(canConvertAdmissionToStudent("ADMITTED")).toBe(true);
  });
});
