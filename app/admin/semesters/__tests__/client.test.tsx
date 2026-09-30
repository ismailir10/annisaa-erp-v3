/**
 * T7 (cycle 2026-09-26, admin-ui-standard-c1) — the semester row used to
 * render its academic year + number as plain text plus three actions
 * ("Kelola tema", "Kelola Tujuan Pembelajaran", "Lihat") next to the ⋯ menu.
 * The identity cell is now a `DataTableLinkCell` `<Link>` to the themes
 * page (with the semester number folded in as the description), the two
 * "Kelola…" navigations moved into the ⋯ menu's `extraActions`, and
 * "Lihat" is gone.
 */
import { afterEach, describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SemestersClient } from "@/app/admin/semesters/client";
import { toast } from "sonner";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
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

// DatePicker renders a plain `<input type="date">` on a coarse (touch)
// pointer and a Button+Calendar popover on a fine pointer; force coarse so
// `fireEvent.change` on a labelled native input is enough to drive it,
// matching the holidays page test (the worked example for this pattern).
function mockCoarsePointer() {
  return vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: query.includes("coarse"),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as unknown as MediaQueryList,
  );
}

function stubFetch() {
  return vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
    void _init;
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

// T3 (cycle 2026-09-27, admin-forms-rhf) — Tambah/Ubah Semester migrated
// onto useZodForm + FormField + semesterFormSchema.
describe("SemestersClient — Tambah Semester dialog (T3 rhf migration)", () => {
  beforeEach(() => {
    pushMock.mockClear();
    vi.stubGlobal("fetch", stubFetch());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("blocks submit with empty required fields, showing inline errors and firing no POST", async () => {
    mockCoarsePointer();
    const fetchMock = stubFetch();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<SemestersClient canWrite />);

    await user.click(await screen.findByRole("button", { name: "Tambah Semester" }));
    const dialog = await screen.findByRole("dialog", { name: "Tambah Semester" });

    await user.click(within(dialog).getByRole("button", { name: "Tambah Semester" }));

    expect(await within(dialog).findByText("Tahun ajaran wajib dipilih")).toBeInTheDocument();
    // Both dates are empty, so the per-field YYYY-MM-DD format check fails
    // before the cross-field "start < end" refine ever runs.
    expect(within(dialog).getAllByText("Format tanggal harus YYYY-MM-DD").length).toBeGreaterThan(0);

    expect(
      fetchMock.mock.calls.some(([url, init]) => {
        const u = typeof url === "string" ? url : url.toString();
        return u.includes("/api/admin/curriculum/semesters") && (init as RequestInit | undefined)?.method === "POST";
      }),
    ).toBe(false);
  });

  it("submits the filled form as POST /api/admin/curriculum/semesters with the expected body", async () => {
    mockCoarsePointer();
    const fetchMock = stubFetch();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<SemestersClient canWrite />);

    await user.click(await screen.findByRole("button", { name: "Tambah Semester" }));
    const dialog = await screen.findByRole("dialog", { name: "Tambah Semester" });

    await user.click(within(dialog).getByRole("combobox", { name: /Tahun ajaran/ }));
    await user.click(await screen.findByRole("option", { name: "2026/2027" }));

    fireEvent.change(within(dialog).getByLabelText("Tanggal mulai", { exact: false }), {
      target: { value: "2026-07-14" },
    });
    fireEvent.change(within(dialog).getByLabelText("Tanggal selesai", { exact: false }), {
      target: { value: "2026-12-19" },
    });

    await user.click(within(dialog).getByRole("button", { name: "Tambah Semester" }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(([url, init]) => {
        const u = typeof url === "string" ? url : url.toString();
        return u.includes("/api/admin/curriculum/semesters") && (init as RequestInit | undefined)?.method === "POST";
      });
      expect(postCall).toBeTruthy();
    });

    const [, postInit] = fetchMock.mock.calls.find(([url, init]) => {
      const u = typeof url === "string" ? url : url.toString();
      return u.includes("/api/admin/curriculum/semesters") && (init as RequestInit | undefined)?.method === "POST";
    })!;
    expect(JSON.parse((postInit as RequestInit).body as string)).toEqual({
      academicYearId: "ay1",
      number: 1,
      startDate: "2026-07-14",
      endDate: "2026-12-19",
    });
  });

  it("DOC-3: offers PLANNING years (not ARCHIVED ones) in the year picker", async () => {
    mockCoarsePointer();
    const base = stubFetch();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/academic-years")) {
          return Promise.resolve({
            ok: true,
            json: async () => [
              { id: "ay1", name: "2026/2027", status: "ACTIVE" },
              { id: "ay2", name: "2027/2028", status: "PLANNING" },
              { id: "ay0", name: "2024/2025", status: "ARCHIVED" },
            ],
          } as Response);
        }
        return base(input, init);
      }),
    );
    const user = userEvent.setup();
    render(<SemestersClient canWrite />);

    await user.click(await screen.findByRole("button", { name: "Tambah Semester" }));
    const dialog = await screen.findByRole("dialog", { name: "Tambah Semester" });
    await user.click(within(dialog).getByRole("combobox", { name: /Tahun ajaran/ }));

    expect(await screen.findByRole("option", { name: "2027/2028 (perencanaan)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "2026/2027" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /2024\/2025/ })).not.toBeInTheDocument();
  });

  it("DOC-3: says so when the new semester was created inactive because another one stays active", async () => {
    mockCoarsePointer();
    vi.mocked(toast.info).mockClear();
    const base = stubFetch();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") {
          return Promise.resolve({ ok: true, status: 201, json: async () => ({ id: "sem2", number: 2, status: "INACTIVE" }) } as Response);
        }
        return base(input, init);
      }),
    );
    const user = userEvent.setup();
    render(<SemestersClient canWrite />);

    await user.click(await screen.findByRole("button", { name: "Tambah Semester" }));
    const dialog = await screen.findByRole("dialog", { name: "Tambah Semester" });
    await user.click(within(dialog).getByRole("combobox", { name: /Tahun ajaran/ }));
    await user.click(await screen.findByRole("option", { name: "2026/2027" }));
    fireEvent.change(within(dialog).getByLabelText("Tanggal mulai", { exact: false }), { target: { value: "2027-01-04" } });
    fireEvent.change(within(dialog).getByLabelText("Tanggal selesai", { exact: false }), { target: { value: "2027-06-19" } });
    await user.click(within(dialog).getByRole("button", { name: "Tambah Semester" }));

    await waitFor(() => expect(toast.info).toHaveBeenCalled());
    expect(vi.mocked(toast.info).mock.calls[0][0]).toContain("belum aktif");
  });
});
