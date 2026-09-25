import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { AdminLinkTabs } from "@/components/admin/admin-tabs";

const navigation = vi.hoisted(() => ({ pathname: "/admin/admissions" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));

// T2 (cycle 2026-09-25, Pendaftaran merge) — AdminLinkTabs is the route-based
// sibling of AdminTabs, used to switch between /admin/admissions ("Calon
// Siswa") and /admin/enrollments ("Formulir") while reading as one tab
// strip. Active item is derived from the current pathname.
describe("AdminLinkTabs", () => {
  const items = [
    { href: "/admin/admissions", label: "Calon Siswa" },
    { href: "/admin/enrollments", label: "Formulir" },
  ];

  beforeEach(() => {
    navigation.pathname = "/admin/admissions";
  });

  it("marks the tab matching the current pathname as current and links the other", () => {
    render(<AdminLinkTabs items={items} />);

    const calonSiswa = screen.getByRole("link", { name: "Calon Siswa" });
    const formulir = screen.getByRole("link", { name: "Formulir" });

    expect(calonSiswa).toHaveAttribute("href", "/admin/admissions");
    expect(calonSiswa).toHaveAttribute("aria-current", "page");

    expect(formulir).toHaveAttribute("href", "/admin/enrollments");
    expect(formulir).not.toHaveAttribute("aria-current");
  });

  it("flips the current tab when the pathname is the other route", () => {
    navigation.pathname = "/admin/enrollments";

    render(<AdminLinkTabs items={items} />);

    expect(screen.getByRole("link", { name: "Formulir" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Calon Siswa" })).not.toHaveAttribute("aria-current");
  });

  it("treats a nested path (e.g. an enrollment detail page) as within the Formulir tab", () => {
    navigation.pathname = "/admin/enrollments/ea-1";

    render(<AdminLinkTabs items={items} />);

    expect(screen.getByRole("link", { name: "Formulir" })).toHaveAttribute("aria-current", "page");
  });
});
