/**
 * T7 (cycle 2026-09-26, admin-ui-standard-c1) — the semester row used to
 * render its academic year + number as plain text plus three actions
 * ("Kelola tema", "Kelola Tujuan Pembelajaran", "Lihat") next to the ⋯ menu.
 * The identity cell is now a `DataTableLinkCell` `<Link>` to the themes
 * page (with the semester number folded in as the description), the two
 * "Kelola…" navigations moved into the ⋯ menu's `extraActions`, and
 * "Lihat" is gone.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SemestersClient } from "@/app/admin/semesters/client";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const semester = {
  id: "sem1",
  academicYearId: "ay1",
  number: 1 as const,
  startDate: "2026-07-01T00:00:00.000Z",
  endDate: "2026-12-31T00:00:00.000Z",
  status: "ACTIVE",
  academicYear: { id: "ay1", name: "2026/2027", status: "ACTIVE" },
  _count: { themes: 3 },
};

function stubFetch() {
  return vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/admin/curriculum/semesters")) {
      return Promise.resolve({ ok: true, json: async () => ({ data: [semester] }) } as Response);
    }
    if (url.includes("/api/academic-years")) {
      return Promise.resolve({ ok: true, json: async () => [semester.academicYear] } as Response);
    }
    return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
  });
}

describe("SemestersClient — name is the link (T7)", () => {
  beforeEach(() => {
    pushMock.mockClear();
    vi.stubGlobal("fetch", stubFetch());
  });

  it("renders the academic year as a link to the themes page, moves Kelola actions into the menu, and drops Lihat", async () => {
    render(<SemestersClient canWrite />);

    await waitFor(() => {
      expect(screen.queryByText("Belum ada semester")).not.toBeInTheDocument();
    });

    const nameLink = await screen.findByRole("link", { name: /2026\/2027/ });
    expect(nameLink).toHaveAttribute("href", "/admin/semesters/sem1/themes");
    expect(screen.getByText("Semester 1")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Lihat/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Kelola tema" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Kelola Tujuan Pembelajaran" })).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Buka menu/i }));
    expect(await screen.findByRole("menuitem", { name: "Kelola tema" })).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "Kelola tema" }));
    expect(pushMock).toHaveBeenCalledWith("/admin/semesters/sem1/themes");
  });
});
