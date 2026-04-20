import { describe, expect, it } from "vitest";
import { getBreadcrumbs } from "../admin-nav";

describe("getBreadcrumbs", () => {
  it("returns single crumb for dashboard", () => {
    expect(getBreadcrumbs("/admin")).toEqual([{ label: "Dashboard" }]);
  });

  it("returns 2-level trail for an exact nav item", () => {
    expect(getBreadcrumbs("/admin/employees")).toEqual([
      { label: "SDM", href: "/admin/employees" },
      { label: "Karyawan" },
    ]);
  });

  it("renders [id] as Detail on depth-3 path", () => {
    expect(getBreadcrumbs("/admin/employees/abc123")).toEqual([
      { label: "SDM" },
      { label: "Karyawan", href: "/admin/employees" },
      { label: "Detail" },
    ]);
  });

  it("renders /edit as Ubah on depth-4 path", () => {
    expect(getBreadcrumbs("/admin/employees/abc123/edit")).toEqual([
      { label: "SDM" },
      { label: "Karyawan", href: "/admin/employees" },
      { label: "Detail" },
      { label: "Ubah" },
    ]);
  });

  it("renders /new as Tambah", () => {
    expect(getBreadcrumbs("/admin/students/new")).toEqual([
      { label: "Akademik" },
      { label: "Siswa", href: "/admin/students" },
      { label: "Tambah" },
    ]);
  });

  it("renders payroll /monthly as Bulanan", () => {
    expect(getBreadcrumbs("/admin/payroll/monthly")).toEqual([
      { label: "SDM" },
      { label: "Penggajian", href: "/admin/payroll" },
      { label: "Bulanan" },
    ]);
  });

  it("renders assessment template detail trail", () => {
    expect(getBreadcrumbs("/admin/assessments/templates/tmpl1")).toEqual([
      { label: "Penilaian" },
      { label: "Template", href: "/admin/assessments/templates" },
      { label: "Detail" },
    ]);
  });

  it("renders assessment detail on new path-segment route", () => {
    expect(getBreadcrumbs("/admin/assessments/abc123")).toEqual([
      { label: "Penilaian" },
      { label: "Penilaian Siswa", href: "/admin/assessments" },
      { label: "Detail" },
    ]);
  });

  it("renders settings sub-page trail", () => {
    expect(getBreadcrumbs("/admin/settings/campuses/c1/edit")).toEqual([
      { label: "Pengaturan" },
      { label: "Kampus", href: "/admin/settings/campuses" },
      { label: "Detail" },
      { label: "Ubah" },
    ]);
  });

  it("returns empty array for unknown path", () => {
    expect(getBreadcrumbs("/admin/does-not-exist")).toEqual([]);
  });
});
