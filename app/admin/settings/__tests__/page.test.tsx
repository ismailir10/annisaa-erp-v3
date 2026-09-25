import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ session: null as { role: string; permissions: string[] } | null }));

vi.mock("@/lib/auth", () => ({
  getSession: async () => auth.session,
  isAdminRole: (role: string) => role === "SUPER_ADMIN" || role === "SCHOOL_ADMIN",
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));

import AdminSettingsPage from "../page";

describe("AdminSettingsPage — permission filtering", () => {
  it("redirects unauthenticated sessions to /", async () => {
    auth.session = null;
    await expect(AdminSettingsPage()).rejects.toThrow("redirect:/");
  });

  it("redirects a non-admin role to /", async () => {
    auth.session = { role: "TEACHER", permissions: [] };
    await expect(AdminSettingsPage()).rejects.toThrow("redirect:/");
  });

  it("redirects an admin with zero settings permissions back to /admin", async () => {
    auth.session = { role: "SCHOOL_ADMIN", permissions: [] };
    await expect(AdminSettingsPage()).rejects.toThrow("redirect:/admin");
  });

  it("shows only the Akses section for a user with just users.view", async () => {
    auth.session = { role: "SCHOOL_ADMIN", permissions: ["users.view"] };
    render(await AdminSettingsPage());

    expect(screen.getByRole("heading", { name: "Pengaturan" })).toBeInTheDocument();
    expect(screen.getByText("Akses")).toBeInTheDocument();
    expect(screen.getByText("Pengguna")).toBeInTheDocument();
    expect(screen.getByText("Peran & Izin")).toBeInTheDocument();

    // Sections gated by permissions this user lacks must not render.
    expect(screen.queryByText("Sekolah")).not.toBeInTheDocument();
    expect(screen.queryByText("Akademik")).not.toBeInTheDocument();
    expect(screen.queryByText("Keuangan & Gaji")).not.toBeInTheDocument();
    expect(screen.queryByText("Kampus")).not.toBeInTheDocument();
    expect(screen.queryByText("Biaya")).not.toBeInTheDocument();
  });

  it("shows every section for a super-admin-equivalent full permission set", async () => {
    auth.session = {
      role: "SCHOOL_ADMIN",
      permissions: [
        "settings.view",
        "academic.view",
        "curriculum.read",
        "reportCard.template",
        "students.view",
        "fees.view",
        "payroll.view",
        "users.view",
      ],
    };
    render(await AdminSettingsPage());

    expect(screen.getByText("Sekolah")).toBeInTheDocument();
    expect(screen.getByText("Akademik")).toBeInTheDocument();
    expect(screen.getByText("Keuangan & Gaji")).toBeInTheDocument();
    expect(screen.getByText("Akses")).toBeInTheDocument();
    expect(screen.getByText("Kampus")).toBeInTheDocument();
    expect(screen.getByText("Tahun Ajaran")).toBeInTheDocument();
    expect(screen.getByText("Semester")).toBeInTheDocument();
    expect(screen.getByText("Bank Narasi")).toBeInTheDocument();
    expect(screen.getByText("Biaya")).toBeInTheDocument();
    expect(screen.getByText("Komponen Gaji")).toBeInTheDocument();
  });
});
