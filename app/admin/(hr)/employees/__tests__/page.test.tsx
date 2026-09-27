import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import EmployeesPage from "../page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body };
}

describe("EmployeesPage list", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("makes the employee name the link into the detail page, with no separate Lihat action", async () => {
    const fetchMock = vi.fn((input: string) => {
      if (input.startsWith("/api/config/campuses")) return Promise.resolve(jsonResponse([]));
      if (input.startsWith("/api/employees/positions")) return Promise.resolve(jsonResponse([]));
      if (input.startsWith("/api/employees/stats")) {
        return Promise.resolve(jsonResponse({ total: 1, active: 1, inactive: 0 }));
      }
      if (input.startsWith("/api/employees?")) {
        return Promise.resolve(
          jsonResponse({
            data: [
              {
                id: "emp-1",
                kode: "K-001",
                nama: "Alya Putri",
                email: "alya@example.com",
                jabatan: "Guru Kelas",
                status: "ACTIVE",
                campusId: "c1",
                bankAccountNo: null,
                bpjsEnrolled: false,
                createdAt: "2026-01-01T00:00:00.000Z",
                campus: { name: "Taman Aster" },
              },
            ],
            pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
          }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<EmployeesPage />);

    const link = await screen.findByRole("link", { name: /Alya Putri/ });
    expect(link).toHaveAttribute("href", "/admin/employees/emp-1");
    expect(screen.queryByRole("button", { name: /Lihat/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Lihat")).not.toBeInTheDocument();
  });
});
