/**
 * T2 (cycle 2026-09-25, Pendaftaran merge) — this page used to have its own
 * confusingly-named nav entry ("Formulir Pendaftaran"). It's now the
 * "Formulir" sub-view of the single "Pendaftaran" nav entry, sharing a
 * link-tab strip with /admin/admissions ("Calon Siswa").
 *
 * T7 (cycle 2026-09-26, admin-ui-standard-c1) — the row action column (a
 * hand-rolled `<Button>Lihat</Button>`, then a `DataTableRowActions`
 * `onView`) is gone; the child's name cell is now the row's only link to
 * the detail page (`DataTableLinkCell`), and the row had no other action.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import EnrollmentsPage from "@/app/admin/enrollments/page";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/enrollments",
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const rows = [
  {
    id: "ea-1",
    childName: "Aisyah Putri",
    parentEmail: "ibu@example.com",
    status: "SUBMITTED",
    dcareAddon: false,
    submittedAt: "2026-09-01T00:00:00.000Z",
    createdAt: "2026-09-01T00:00:00.000Z",
    studentId: null,
    program: { name: "TK A" },
  },
];

function stubFetch() {
  return vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/enrollments?")) {
      const parsed = new URL(url, "http://localhost");
      const status = parsed.searchParams.get("status");
      const pageSize = parsed.searchParams.get("pageSize");
      // Stats calls: pageSize=1 with/without a status filter.
      if (pageSize === "1") {
        const total = !status ? rows.length : status === "SUBMITTED" ? 1 : 0;
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: [], pagination: { page: 1, pageSize: 1, total, totalPages: total > 0 ? 1 : 0 } }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          data: rows,
          pagination: { page: 1, pageSize: 20, total: rows.length, totalPages: 1 },
        }),
      } as Response);
    }
    return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
  });
}

describe("EnrollmentsPage — Pendaftaran tab strip", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", stubFetch());
  });

  it("renders the Calon Siswa / Formulir strip with Formulir marked current", async () => {
    render(<EnrollmentsPage />);

    const formulir = await screen.findByRole("link", { name: "Formulir" });
    expect(formulir).toHaveAttribute("href", "/admin/enrollments");
    expect(formulir).toHaveAttribute("aria-current", "page");

    const calonSiswa = screen.getByRole("link", { name: "Calon Siswa" });
    expect(calonSiswa).toHaveAttribute("href", "/admin/admissions");
    expect(calonSiswa).not.toHaveAttribute("aria-current");
  });
});

describe("EnrollmentsPage — name is the link (T7)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", stubFetch());
  });

  it("renders the child's name as a link to the detail page and drops the separate Lihat button", async () => {
    render(<EnrollmentsPage />);

    const nameLink = await screen.findByRole("link", { name: "Aisyah Putri" });
    expect(nameLink).toHaveAttribute("href", "/admin/enrollments/ea-1");
    expect(screen.queryByRole("button", { name: /^Lihat/ })).not.toBeInTheDocument();
  });
});
