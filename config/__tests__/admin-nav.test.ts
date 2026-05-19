import { describe, expect, it } from "vitest";
import { ClipboardList, ClipboardCheck } from "lucide-react";
import {
  adminNav,
  getActiveItem,
  getBreadcrumbs,
  type NavItem,
} from "../admin-nav";

const assessmentItems: NavItem[] = [
  { label: "Template Penilaian", href: "/admin/assessment-templates", icon: ClipboardList },
  { label: "Penilaian Siswa", href: "/admin/assessments", icon: ClipboardCheck },
];

describe("getActiveItem — longest-prefix wins", () => {
  it("picks flat template path", () => {
    const active = getActiveItem("/admin/assessment-templates", assessmentItems);
    expect(active?.href).toBe("/admin/assessment-templates");
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

  it("orders groups: students → academic → curriculum → assessment → classroom → finance → hr", () => {
    expect(groupIds).toEqual([
      "students",
      "academic",
      "curriculum",
      "assessment",
      "classroom",
      "finance",
      "hr",
    ]);
  });

  it("academic group is gated by academic.view, label Akademik, lists Tahun Ajaran + Kelas only", () => {
    const group = adminNav.groups.find((g) => g.id === "academic")!;
    expect(group.label).toBe("Akademik");
    expect(group.permission).toBe("academic.view");
    expect(group.items.map((i) => i.label)).toEqual([
      "Tahun Ajaran",
      "Kelas",
    ]);
    expect(group.items.map((i) => i.href)).toEqual([
      "/admin/academic-years",
      "/admin/classes",
    ]);
    const kelas = group.items.find((i) => i.label === "Kelas")!;
    expect(kelas.permission).toBe("academic.view");
  });

  it("curriculum group is gated by curriculum.read and holds content-authoring items only", () => {
    const group = adminNav.groups.find((g) => g.id === "curriculum")!;
    expect(group.permission).toBe("curriculum.read");
    expect(group.items.map((i) => i.label)).toEqual(["Semester"]);
    expect(group.items.map((i) => i.href)).toEqual(["/admin/semesters"]);
    const semester = group.items.find((i) => i.label === "Semester")!;
    expect(semester.permission).toBe("curriculum.read");
  });

  it("students group covers the admission → enrollment funnel", () => {
    const labels = adminNav.groups.find((g) => g.id === "students")!.items.map((i) => i.label);
    expect(labels).toEqual([
      "Pendaftaran",
      "Siswa",
      "Wali Murid",
      "Penempatan",
    ]);
  });

  it("assessment group has Template Penilaian first, then Penilaian Siswa", () => {
    const labels = adminNav.groups.find((g) => g.id === "assessment")!.items.map((i) => i.label);
    expect(labels).toEqual(["Template Penilaian", "Penilaian Siswa"]);
  });

  it("classroom group holds the daily teacher ops items", () => {
    const labels = adminNav.groups.find((g) => g.id === "classroom")!.items.map((i) => i.label);
    expect(labels).toEqual(["Kehadiran Siswa", "Buku Penghubung"]);
  });

  it("hr group keeps hr.view gate and holds salary-components inline", () => {
    const group = adminNav.groups.find((g) => g.id === "hr")!;
    expect(group.permission).toBe("hr.view");
    expect(group.items.map((i) => i.label)).toEqual([
      "Karyawan",
      "Kehadiran",
      "Pengajuan Cuti",
      "Komponen Gaji",
      "Penggajian",
    ]);
    const salary = group.items.find((i) => i.label === "Komponen Gaji")!;
    expect(salary.href).toBe("/admin/salary-components");
    expect(salary.permission).toBe("hr.view");
  });

  it("settings stays flat: campuses, work-hours, holidays, users, roles (+ design-system in dev)", () => {
    const labels = adminNav.settings.map((i) => i.label);
    expect(labels.slice(0, 5)).toEqual([
      "Kampus",
      "Jam Kerja",
      "Hari Libur",
      "Pengguna",
      "Peran & Izin",
    ]);
    expect(adminNav.settings.find((i) => i.label === "Jam Kerja")?.href).toBe(
      "/admin/settings/work-hours",
    );
    expect(adminNav.settings.find((i) => i.label === "Komponen Gaji")).toBeUndefined();
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
      { label: "Kesiswaan" },
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

  it("returns 2-level trail for assessment-templates exact path", () => {
    expect(getBreadcrumbs("/admin/assessment-templates")).toEqual([
      { label: "Penilaian" },
      { label: "Template Penilaian" },
    ]);
  });

  it("renders assessment template detail trail (now flat path)", () => {
    expect(getBreadcrumbs("/admin/assessment-templates/tmpl1")).toEqual([
      { label: "Penilaian" },
      { label: "Template Penilaian", href: "/admin/assessment-templates" },
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
