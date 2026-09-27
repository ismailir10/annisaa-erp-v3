/**
 * T7 (cycle 2026-09-26, admin-ui-standard-c1) — the classes list name cell
 * becomes a `DataTableLinkCell` link to the class detail page; the row's
 * `⋯` menu (edit / deactivate) stays via `DataTableRowActions`, but the
 * separate "Lihat" button is gone.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { ClassesClient } from "@/app/admin/classes/client";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const year = { id: "y1", name: "2026/2027", status: "ACTIVE", startDate: "2026-07-01", endDate: "2027-06-30" };

const classRow = {
  id: "c1",
  name: "TKIT A",
  capacity: 20,
  slotTemplate: "FULL_DAY",
  ageGroup: "A",
  status: "ACTIVE",
  campusId: "cp1",
  programId: "p1",
  academicYearId: "y1",
  classTrackId: "ct1",
  campus: { id: "cp1", name: "Taman Aster" },
  program: { id: "p1", code: "TK", name: "Taman Kanak-kanak" },
  academicYear: year,
  enrolledCount: 10,
  attendance7dPct: 90,
  todaySession: "Held" as const,
  health: "Sehat" as const,
  teachingAssignments: [],
};

function stubFetch() {
  return vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/config/campuses")) {
      return Promise.resolve({ ok: true, json: async () => ({ data: [] }) } as Response);
    }
    if (url.includes("/api/programs")) {
      return Promise.resolve({ ok: true, json: async () => ({ data: [] }) } as Response);
    }
    if (url.includes("/api/academic-years")) {
      return Promise.resolve({ ok: true, json: async () => ({ data: [year] }) } as Response);
    }
    if (url.includes("/api/admin/classes")) {
      return Promise.resolve({ ok: true, json: async () => ({ data: [classRow] }) } as Response);
    }
    return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
  });
}

describe("ClassesClient — name is the link (T7)", () => {
  it("renders the class name as a link to the detail page and drops the separate Lihat button", async () => {
    vi.stubGlobal("fetch", stubFetch());

    render(<ClassesClient canWrite={true} />);

    const nameLink = await screen.findByRole("link", { name: "TKIT A" });
    expect(nameLink).toHaveAttribute("href", "/admin/classes/c1");
    expect(screen.queryByRole("button", { name: /^Lihat/ })).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Aksi untuk TKIT A/ })).toBeInTheDocument();
    });
  });
});
