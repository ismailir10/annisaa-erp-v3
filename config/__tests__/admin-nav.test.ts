import { describe, expect, it } from "vitest";
import { ClipboardList } from "lucide-react";
import {
  adminNav,
  getActiveItem,
  getBreadcrumbs,
  type NavItem,
} from "../admin-nav";

const assessmentItems: NavItem[] = [
  { label: "Template Penilaian", href: "/admin/assessments/templates", icon: ClipboardList },
  { label: "Penilaian Siswa", href: "/admin/assessments", icon: ClipboardList },
];

describe("getActiveItem — longest-prefix wins", () => {
  it("picks child over prefix-colliding parent on child path", () => {
    const active = getActiveItem("/admin/assessments/templates", assessmentItems);
    expect(active?.href).toBe("/admin/assessments/templates");
  });

  it("picks parent on parent path", () => {
    const active = getActiveItem("/admin/assessments", assessmentItems);
    expect(active?.href).toBe("/admin/assessments");
  });

  it("picks parent on non-child sibling path (scores)", () => {
    const active = getActiveItem("/admin/assessments/scores", assessmentItems);
    expect(active?.href).toBe("/admin/assessments");
  });

  it("returns null on unrelated path", () => {
    const active = getActiveItem("/admin/students", assessmentItems);
    expect(active).toBeNull();
  });
});

describe("adminNav IA — ordering + grouping", () => {
  const groupIds = adminNav.groups.map((g) => g.id);

  it("orders groups: hr → academic → learning → finance", () => {
    expect(groupIds).toEqual(["hr", "academic", "learning", "finance"]);
  });

  it("academic group follows student funnel order", () => {
    const labels = adminNav.groups.find((g) => g.id === "academic")!.items.map((i) => i.label);
    expect(labels).toEqual([
      "Tahun Ajaran",
      "Pendaftaran",
      "Siswa",
      "Wali Murid",
      "Penempatan",
      "Guru Pengajar",
      "Kehadiran Siswa",
      "Buku Penghubung",
    ]);
  });

  it("learning group has Template Penilaian first, then Penilaian Siswa", () => {
    const labels = adminNav.groups.find((g) => g.id === "learning")!.items.map((i) => i.label);
    expect(labels).toEqual(["Template Penilaian", "Penilaian Siswa"]);
  });
});

describe("getBreadcrumbs", () => {
  it("returns single crumb for dashboard", () => {
    expect(getBreadcrumbs("/admin")).toEqual([{ label: "Dashboard" }]);
  });

  it("returns 2-level trail for an exact nav item", () => {
    expect(getBreadcrumbs("/admin/employees")).toEqual([
      { label: "SDM" },
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
      { label: "Template Penilaian", href: "/admin/assessments/templates" },
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
