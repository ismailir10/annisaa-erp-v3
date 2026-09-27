/**
 * T7 (cycle 2026-09-26, admin-ui-standard-c1) — the classes list name cell
 * becomes a `DataTableLinkCell` link to the class detail page; the row's
 * `⋯` menu (edit / deactivate) stays via `DataTableRowActions`, but the
 * separate "Lihat" button is gone.
 */
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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

// T2 (2026-09-27 admin-finish-standard) — the Kondisi column renders
// `<StatusBadge>` off the new STATUS_MAP health keys instead of a raw
// `<Badge>` + the standalone `healthTone()` helper.
describe("ClassesClient — Kondisi column (T2 StatusBadge migration)", () => {
  it("renders the row's health value on the shared StatusBadge tone", async () => {
    vi.stubGlobal("fetch", stubFetch());

    render(<ClassesClient canWrite={true} />);

    const badge = await screen.findByText("Sehat");
    expect(badge.className).toContain("status-present-subtle");
  });
});

// T3 (cycle 2026-09-27, admin-forms-rhf) — Tambah/Ubah Kelas migrated onto
// useZodForm + FormField + classFormSchema.
const campus = { id: "cp1", name: "Taman Aster", status: "ACTIVE" };
const program = { id: "p1", code: "TK", name: "Taman Kanak-kanak", status: "ACTIVE" };

function stubFetchWithDialog(overrides: { post?: unknown; postOk?: boolean } = {}) {
  const { post = { id: "c-2" }, postOk = true } = overrides;
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/config/campuses")) {
      return Promise.resolve({ ok: true, json: async () => ({ data: [campus] }) } as Response);
    }
    if (url.includes("/api/programs")) {
      return Promise.resolve({ ok: true, json: async () => ({ data: [program] }) } as Response);
    }
    if (url.includes("/api/academic-years")) {
      return Promise.resolve({ ok: true, json: async () => ({ data: [year] }) } as Response);
    }
    if (url.includes("/api/admin/classes") && init?.method === "POST") {
      return Promise.resolve({ ok: postOk, status: postOk ? 201 : 400, json: async () => post } as Response);
    }
    if (url.includes("/api/admin/classes")) {
      return Promise.resolve({ ok: true, json: async () => ({ data: [classRow] }) } as Response);
    }
    return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function findPostCall(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.find(([input, init]) => {
    const url = typeof input === "string" ? input : (input as { toString(): string }).toString();
    return url.includes("/api/admin/classes") && (init as RequestInit | undefined)?.method === "POST";
  });
}

describe("ClassesClient — Tambah Kelas dialog (T3 rhf migration)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("blocks submit with empty required fields, showing inline errors and firing no POST", async () => {
    const fetchMock = stubFetchWithDialog();
    const user = userEvent.setup();
    render(<ClassesClient canWrite={true} />);

    await user.click(await screen.findByRole("button", { name: "Tambah Kelas" }));
    const dialog = await screen.findByRole("dialog", { name: "Tambah Kelas" });

    await user.click(within(dialog).getByRole("button", { name: "Tambah Kelas" }));

    expect(await within(dialog).findByText("Kampus wajib dipilih")).toBeInTheDocument();
    expect(within(dialog).getByText("Program wajib dipilih")).toBeInTheDocument();
    expect(within(dialog).getByText("Nama kelas wajib diisi")).toBeInTheDocument();
    expect(within(dialog).getByText("Kelompok usia wajib dipilih")).toBeInTheDocument();

    expect(findPostCall(fetchMock)).toBeUndefined();
  });

  it("submits the filled form as POST /api/admin/classes with the expected body", async () => {
    const fetchMock = stubFetchWithDialog();
    const user = userEvent.setup();
    render(<ClassesClient canWrite={true} />);

    await user.click(await screen.findByRole("button", { name: "Tambah Kelas" }));
    const dialog = await screen.findByRole("dialog", { name: "Tambah Kelas" });

    await user.click(within(dialog).getByRole("combobox", { name: /Kampus/ }));
    await user.click(await screen.findByRole("option", { name: "Taman Aster" }));

    await user.click(within(dialog).getByRole("combobox", { name: /Program/ }));
    await user.click(await screen.findByRole("option", { name: /Taman Kanak-kanak/ }));

    await user.type(within(dialog).getByPlaceholderText("mis. TKIT A"), "TKIT Baru");

    await user.click(within(dialog).getByRole("combobox", { name: /Kelompok usia/ }));
    await user.click(await screen.findByRole("option", { name: /TK A/ }));

    await user.click(within(dialog).getByRole("button", { name: "Tambah Kelas" }));

    await waitFor(() => expect(findPostCall(fetchMock)).toBeTruthy());

    const [, postInit] = findPostCall(fetchMock)!;
    expect(JSON.parse((postInit as RequestInit).body as string)).toEqual({
      campusId: "cp1",
      programId: "p1",
      academicYearId: "y1",
      name: "TKIT Baru",
      capacity: 20,
      slotTemplate: "FULL_DAY",
      ageGroup: "A",
    });
  });
});
