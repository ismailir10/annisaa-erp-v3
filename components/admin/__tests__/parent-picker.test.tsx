/**
 * ParentPicker — the search-an-existing-wali combobox behind "Tambah Wali".
 *
 * Mirrors components/admin/student-picker.tsx, so the assertions here track
 * the five explicit fetch states plus the two behaviours unique to this
 * picker: excluding already-linked parents, and keeping the clear control
 * outside the combobox trigger (a nested button is unreachable by keyboard).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ParentPicker, type PickableParent } from "../parent-picker";

function guardianPayload(
  rows: Array<{
    id: string;
    name: string;
    phone?: string | null;
    email?: string | null;
    children?: number;
  }>,
  total?: number,
) {
  return {
    data: rows.map((r) => ({
      id: r.id,
      name: r.name,
      phone: r.phone ?? null,
      email: r.email ?? null,
      _count: { guardians: r.children ?? 0 },
    })),
    pagination: { page: 1, pageSize: 20, total: total ?? rows.length, totalPages: 1 },
  };
}

function mockFetchOnce(payload: unknown, ok = true) {
  const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) => ({
    ok,
    status: ok ? 200 : 500,
    json: async () => payload,
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function openAndType(text: string) {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  await user.click(screen.getByRole("combobox"));
  await user.type(screen.getByPlaceholderText(/Cari nama, telepon/), text);
  return user;
}

describe("ParentPicker", () => {
  it("shows the idle prompt before anything is typed", async () => {
    mockFetchOnce(guardianPayload([]));
    render(<ParentPicker selected={null} onSelect={vi.fn()} />);

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByRole("combobox"));

    expect(
      screen.getByText("Ketik nama wali untuk mencari."),
    ).toBeInTheDocument();
  });

  it("debounces, then renders results with phone and child count", async () => {
    const fetchMock = mockFetchOnce(
      guardianPayload([
        { id: "p1", name: "Siti Aminah", phone: "081234567890", children: 2 },
      ]),
    );
    render(<ParentPicker selected={null} onSelect={vi.fn()} />);

    await openAndType("siti");
    expect(fetchMock).not.toHaveBeenCalled();

    vi.advanceTimersByTime(250);
    await waitFor(() => expect(screen.getByText("Siti Aminah")).toBeInTheDocument());
    expect(screen.getByText(/081234567890 · 2 anak terdaftar/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("search=siti");
    expect(String(fetchMock.mock.calls[0][0])).toContain("status=ACTIVE");
  });

  it("hands the chosen parent back to the caller", async () => {
    mockFetchOnce(
      guardianPayload([{ id: "p1", name: "Siti Aminah", children: 1 }]),
    );
    const onSelect = vi.fn();
    render(<ParentPicker selected={null} onSelect={onSelect} />);

    const user = await openAndType("siti");
    vi.advanceTimersByTime(250);
    await waitFor(() => expect(screen.getByText("Siti Aminah")).toBeInTheDocument());
    await user.click(screen.getByText("Siti Aminah"));

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "p1", name: "Siti Aminah", childCount: 1 }),
    );
  });

  it("drops parents already linked to this student", async () => {
    // Offering them would only ever produce a GUARDIAN_LINK_EXISTS 409.
    mockFetchOnce(
      guardianPayload([
        { id: "p1", name: "Sudah Tertaut" },
        { id: "p2", name: "Belum Tertaut" },
      ]),
    );
    render(
      <ParentPicker selected={null} onSelect={vi.fn()} excludeIds={["p1"]} />,
    );

    await openAndType("ta");
    vi.advanceTimersByTime(250);
    await waitFor(() =>
      expect(screen.getByText("Belum Tertaut")).toBeInTheDocument(),
    );
    expect(screen.queryByText("Sudah Tertaut")).not.toBeInTheDocument();
  });

  it("offers a retry when the fetch fails", async () => {
    mockFetchOnce({}, false);
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ParentPicker selected={null} onSelect={vi.fn()} />);

    await openAndType("siti");
    vi.advanceTimersByTime(250);

    await waitFor(() =>
      expect(screen.getByText("Gagal memuat data wali. Coba lagi.")).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Coba lagi" })).toBeInTheDocument();
  });

  it("names the empty case and points at the create path", async () => {
    mockFetchOnce(guardianPayload([]));
    render(<ParentPicker selected={null} onSelect={vi.fn()} />);

    await openAndType("zzz");
    vi.advanceTimersByTime(250);

    await waitFor(() =>
      expect(
        screen.getByText(/Tidak ada wali cocok dengan "zzz"/),
      ).toBeInTheDocument(),
    );
  });

  it("warns when results are truncated", async () => {
    mockFetchOnce(
      guardianPayload([{ id: "p1", name: "Siti Aminah" }], 57),
    );
    render(<ParentPicker selected={null} onSelect={vi.fn()} />);

    await openAndType("siti");
    vi.advanceTimersByTime(250);

    await waitFor(() =>
      expect(
        screen.getByText("Menampilkan 20 dari 57 hasil. Persempit pencarian."),
      ).toBeInTheDocument(),
    );
  });

  it("renders the clear control as a sibling of the combobox, not inside it", async () => {
    const selected: PickableParent = {
      id: "p1",
      name: "Siti Aminah",
      phone: "081234567890",
      email: null,
      childCount: 1,
    };
    const onSelect = vi.fn();
    render(<ParentPicker selected={selected} onSelect={onSelect} />);

    const combobox = screen.getByRole("combobox");
    const clear = screen.getByRole("button", { name: "Hapus pilihan wali" });
    expect(combobox).toHaveTextContent("Siti Aminah · 081234567890");
    expect(combobox.contains(clear)).toBe(false);

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(clear);
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("shows no clear control when nothing is selected", () => {
    render(<ParentPicker selected={null} onSelect={vi.fn()} />);
    expect(
      screen.queryByRole("button", { name: "Hapus pilihan wali" }),
    ).not.toBeInTheDocument();
  });
});
