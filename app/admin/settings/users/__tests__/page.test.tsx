import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import UsersPage from "@/app/admin/settings/users/page";

const { toastError, toastSuccess } = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: toastError,
    success: toastSuccess,
  },
}));

vi.mock("@/components/ui/data-table-row-actions", () => ({
  DataTableRowActions: ({
    onDeactivate,
    onActivate,
  }: {
    onDeactivate?: () => void;
    onActivate?: () => void;
  }) => (
    <>
      {onDeactivate && (
        <button type="button" onClick={onDeactivate}>
          Nonaktifkan
        </button>
      )}
      {onActivate && (
        <button type="button" onClick={onActivate}>
          Aktifkan
        </button>
      )}
    </>
  ),
}));

function usersListResponse(rows: Array<Record<string, unknown>>) {
  return {
    ok: true,
    json: async () => ({
      data: rows,
      pagination: { page: 1, pageSize: 20, total: rows.length, totalPages: 1 },
    }),
  };
}

function statsResponse(total: number) {
  return { ok: true, json: async () => ({ pagination: { total } }) };
}

describe("UsersPage deactivate/activate confirmation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("does not flip status until the deactivate confirm dialog is confirmed", async () => {
    const user = userEvent.setup();
    const activeUser = {
      id: "user-1",
      name: "Budi Santoso",
      email: "budi@example.com",
      role: "TEACHER",
      status: "ACTIVE",
      lastLoginAt: null,
      customRoleId: null,
      customRole: null,
    };
    const fetchMock = vi
      .fn()
      // roles fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [] }) })
      // 5 stats fetches
      .mockResolvedValueOnce(statsResponse(0))
      .mockResolvedValueOnce(statsResponse(1))
      .mockResolvedValueOnce(statsResponse(0))
      .mockResolvedValueOnce(statsResponse(0))
      .mockResolvedValueOnce(statsResponse(0))
      // initial list fetch
      .mockResolvedValueOnce(usersListResponse([activeUser]))
      // PUT status
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      // refetch after success
      .mockResolvedValueOnce(usersListResponse([{ ...activeUser, status: "INACTIVE" }]));
    vi.stubGlobal("fetch", fetchMock);

    render(<UsersPage />);

    await screen.findByText("Budi Santoso");

    await user.click(screen.getByRole("button", { name: "Nonaktifkan" }));

    // The confirm dialog must appear — no PUT fired by the row click alone.
    await screen.findByText('Nonaktifkan "Budi Santoso"?');
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/users/user-1",
      expect.objectContaining({ method: "PUT" }),
    );

    const deactivateDialog = screen.getByRole("alertdialog");
    await user.click(within(deactivateDialog).getByRole("button", { name: "Nonaktifkan" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/users/user-1", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "INACTIVE" }),
      });
    });
    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith("Pengguna dinonaktifkan");
    });
  });

  it("does not flip status until the activate confirm dialog is confirmed", async () => {
    const user = userEvent.setup();
    const inactiveUser = {
      id: "user-2",
      name: "Sari Wulandari",
      email: "sari@example.com",
      role: "TEACHER",
      status: "INACTIVE",
      lastLoginAt: null,
      customRoleId: null,
      customRole: null,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [] }) })
      .mockResolvedValueOnce(statsResponse(0))
      .mockResolvedValueOnce(statsResponse(0))
      .mockResolvedValueOnce(statsResponse(0))
      .mockResolvedValueOnce(statsResponse(0))
      .mockResolvedValueOnce(statsResponse(1))
      .mockResolvedValueOnce(usersListResponse([inactiveUser]))
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce(usersListResponse([{ ...inactiveUser, status: "ACTIVE" }]));
    vi.stubGlobal("fetch", fetchMock);

    render(<UsersPage />);

    await screen.findByText("Sari Wulandari");

    await user.click(screen.getByRole("button", { name: "Aktifkan" }));

    await screen.findByText('Aktifkan "Sari Wulandari"?');
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/users/user-2",
      expect.objectContaining({ method: "PUT" }),
    );

    const activateDialog = screen.getByRole("alertdialog");
    await user.click(within(activateDialog).getByRole("button", { name: "Aktifkan" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/users/user-2", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ACTIVE" }),
      });
    });
    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith("Pengguna diaktifkan");
    });
  });
});
