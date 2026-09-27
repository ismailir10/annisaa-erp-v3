import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CampusesPage from "../page";

const { toastError, toastSuccess } = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => true }));
vi.mock("sonner", () => ({ toast: { error: toastError, success: toastSuccess } }));

describe("CampusesPage mobile form", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("keeps entered values after a save error and allows a retry from the sheet", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Nama sudah dipakai" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => [] });
    vi.stubGlobal("fetch", fetchMock);

    render(<CampusesPage />);
    await user.click(await screen.findByRole("button", { name: "Tambah Kampus" }));

    const sheet = screen.getByRole("dialog", { name: "Tambah Kampus" });
    expect(sheet).toHaveAttribute("data-slot", "sheet-content");
    await user.type(within(sheet).getByRole("textbox", { name: /Nama/ }), "Kampus Timur");
    await user.click(within(sheet).getByRole("button", { name: "Tambah Kampus" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Nama sudah dipakai"));
    expect(within(sheet).getByRole("textbox", { name: /Nama/ })).toHaveValue("Kampus Timur");
    await user.click(within(sheet).getByRole("button", { name: "Tambah Kampus" }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Kampus ditambahkan"));
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/config/campuses", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining('"name":"Kampus Timur"'),
    }));
  });
});

describe("CampusesPage create dialog validation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("blocks submit with an empty Nama, showing an inline error and firing no POST", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<CampusesPage />);

    await user.click(await screen.findByRole("button", { name: "Tambah Kampus" }));
    const sheet = screen.getByRole("dialog", { name: "Tambah Kampus" });

    await user.click(within(sheet).getByRole("button", { name: "Tambah Kampus" }));

    expect(await within(sheet).findByText("Nama wajib diisi")).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "POST"),
    ).toBe(false);
  });
});

describe("CampusesPage list", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("renders campuses as a DataTable row — plain name, StatusBadge, no Lihat", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: "campus-1",
          name: "Taman Aster",
          address: "Jl. Contoh No.1",
          lat: null,
          lng: null,
          status: "ACTIVE",
          _count: { employees: 3 },
        },
      ],
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CampusesPage />);

    const name = await screen.findByText("Taman Aster");
    expect(name.closest("a")).toBeNull();
    const row = name.closest("tr");
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText("Aktif")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Lihat/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Lihat")).not.toBeInTheDocument();
  });
});
