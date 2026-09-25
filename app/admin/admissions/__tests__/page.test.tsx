/**
 * T2 (cycle 2026-09-25, Pendaftaran merge) — /admin/admissions and
 * /admin/enrollments used to be two separate, confusingly-named nav
 * entries. They're now one "Pendaftaran" entry with a link-tab strip
 * ("Calon Siswa" / "Formulir") under the PageHeader so the admin can tell
 * which sub-view they're in and jump to the other. This guards that the
 * strip renders on the admissions page with "Calon Siswa" marked current.
 *
 * Companion coverage for the conversion-eligibility logic lives in
 * `page.test.ts` (node env, no DOM) — unchanged by this cycle.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import AdmissionsPage from "@/app/admin/admissions/page";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/admissions",
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

function stubFetch() {
  return vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/admissions")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          data: [],
          pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
          canEdit: true,
        }),
      } as Response);
    }
    if (url.includes("/api/programs")) {
      return Promise.resolve({ ok: true, json: async () => [] } as Response);
    }
    if (url.includes("/api/config/campuses")) {
      return Promise.resolve({ ok: true, json: async () => [] } as Response);
    }
    return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
  });
}

describe("AdmissionsPage — Pendaftaran tab strip", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", stubFetch());
  });

  it("renders the Calon Siswa / Formulir strip with Calon Siswa marked current", async () => {
    render(<AdmissionsPage />);

    const calonSiswa = await screen.findByRole("link", { name: "Calon Siswa" });
    expect(calonSiswa).toHaveAttribute("href", "/admin/admissions");
    expect(calonSiswa).toHaveAttribute("aria-current", "page");

    const formulir = screen.getByRole("link", { name: "Formulir" });
    expect(formulir).toHaveAttribute("href", "/admin/enrollments");
    expect(formulir).not.toHaveAttribute("aria-current");
  });
});
