import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const hrRoot = resolve(process.cwd(), "app/admin/(hr)");

function source(path: string) {
  return readFileSync(resolve(hrRoot, path), "utf8");
}

describe("HR form accessibility contract", () => {
  it("pairs employee form labels with controls and exposes required fields", () => {
    const createPage = source("employees/page.tsx");
    const detailPage = source("employees/[id]/page.tsx");

    expect(createPage).toContain('htmlFor="employee-nama" required');
    expect(createPage).toContain('id="employee-nama" required');
    expect(createPage).toContain('id="employee-position" aria-required="true"');
    expect(createPage).toContain('htmlFor="employee-bpjs"');
    expect(detailPage).toContain('htmlFor="employee-detail-nama" required');
    expect(detailPage).toContain('id="employee-detail-nama" required');
    expect(detailPage).toContain('id="employee-detail-campus" aria-required="true"');
    expect(detailPage).toContain('aria-label={`Nilai ${sv.componentDef.label}`}');
  });

  it("pairs salary component labels with controls and exposes required fields", () => {
    const page = source("salary-components/page.tsx");

    expect(page).toContain('htmlFor="salary-component-code" required');
    expect(page).toContain('id="salary-component-code" required');
    expect(page).toContain('htmlFor="salary-component-label" required');
    expect(page).toContain('id="salary-component-label" required');
    expect(page).toContain('htmlFor="salary-component-category"');
  });
});

describe("HR monthly attendance accessibility contract", () => {
  it("gives every attendance cell its employee, date, and status", () => {
    const page = source("employee-attendance/monthly/page.tsx");

    expect(page).toContain("const STATUS_LABELS");
    expect(page).toContain('aria-label={`${emp.employee.nama}, ${dateStr}, ${status}${record?.isLocked ? ", terkunci" : ""}`}');
    expect(page).toContain("disabled={record?.isLocked}");
  });
});
