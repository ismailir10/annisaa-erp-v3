import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const hrRoot = resolve(process.cwd(), "app/admin/(hr)");

function source(path: string) {
  return readFileSync(resolve(hrRoot, path), "utf8");
}

// T6 migrated `employees/page.tsx` and `salary-components/page.tsx` onto the
// shared `<FormField>` (components/ui/form.tsx): label ↔ control pairing,
// `aria-required`/`aria-describedby` wiring, and the required asterisk all
// live in that one component now, so a page's source no longer spells out
// `htmlFor="x" required` / `id="x" aria-required="true"` by hand — it passes
// `required` + `id` as `<FormField>` props instead. This locates the
// `<FormField ... id="X" ...>` block for a given control id and asserts the
// `required` prop is (or isn't) there, which is the part a page can still
// get wrong (`employees/[id]/page.tsx` isn't migrated yet — Cycle 3 splits
// that dossier — so its raw-JSX contract below is unchanged).
function formFieldBlock(src: string, id: string): string {
  const idAttr = `id="${id}"`;
  const idIndex = src.indexOf(idAttr);
  expect(idIndex, `expected to find ${idAttr} in source`).toBeGreaterThan(-1);
  const start = src.lastIndexOf("<FormField", idIndex);
  expect(start, `expected a <FormField> before ${idAttr}`).toBeGreaterThan(-1);
  const end = src.indexOf("render={", idIndex);
  return src.slice(start, end === -1 ? undefined : end);
}

describe("HR form accessibility contract", () => {
  it("pairs employee form labels with controls and exposes required fields", () => {
    const createPage = source("employees/page.tsx");
    const detailPage = source("employees/[id]/page.tsx");

    expect(formFieldBlock(createPage, "employee-nama")).toContain("required");
    expect(formFieldBlock(createPage, "employee-position")).toContain("required");
    expect(createPage).toContain('id="employee-bpjs"');
    expect(detailPage).toContain('htmlFor="employee-detail-nama" required');
    expect(detailPage).toContain('id="employee-detail-nama" required');
    expect(detailPage).toContain('id="employee-detail-campus" aria-required="true"');
    expect(detailPage).toContain('aria-label={`Nilai ${sv.componentDef.label}`}');
  });

  it("pairs salary component labels with controls and exposes required fields", () => {
    const page = source("salary-components/page.tsx");

    expect(formFieldBlock(page, "salary-component-code")).toContain("required");
    expect(formFieldBlock(page, "salary-component-label")).toContain("required");
    expect(page).toContain('id="salary-component-category"');
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
