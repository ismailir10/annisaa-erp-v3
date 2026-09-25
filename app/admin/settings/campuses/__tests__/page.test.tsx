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
