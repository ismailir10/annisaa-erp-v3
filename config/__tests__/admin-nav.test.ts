import { describe, expect, it } from "vitest";
import { ClipboardList } from "lucide-react";
import { adminNav, getActiveItem, type NavItem } from "../admin-nav";

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
    ]);
  });

  it("learning group has Template Penilaian first, then Penilaian Siswa", () => {
    const labels = adminNav.groups.find((g) => g.id === "learning")!.items.map((i) => i.label);
    expect(labels).toEqual(["Template Penilaian", "Penilaian Siswa"]);
  });
});
