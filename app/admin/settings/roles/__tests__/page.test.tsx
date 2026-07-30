import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import RolesPage from "@/app/admin/settings/roles/page";

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
    extraActions,
  }: {
    extraActions?: Array<{ label: string; onClick: () => void }>;
  }) => (
    <button type="button" onClick={extraActions?.[0]?.onClick}>
      {extraActions?.[0]?.label}
    </button>
  ),
}));

describe("RolesPage delete confirmation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("keeps the dialog open after a failed delete and allows retry", async () => {
    const user = userEvent.setup();
    const role = {
      id: "role-1",
      name: "Admin Keuangan",
      code: "FINANCE_ADMIN",
      description: null,
      isSystem: false,
      permissions: "[]",
      _count: { users: 0 },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [role] }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "Peran masih digunakan" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<RolesPage />);

    await screen.findByText("Admin Keuangan");
    await user.click(screen.getByRole("button", { name: "Hapus" }));

    await user.click(screen.getByRole("button", { name: "Ya, Hapus" }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Peran masih digunakan");
    });
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "Ya, Hapus" }),
    ).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Ya, Hapus" }));

    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith("Peran dihapus");
    });
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Ya, Hapus" }),
      ).not.toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/roles/role-1",
      { method: "DELETE" },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/roles/role-1",
      { method: "DELETE" },
    );
  });
});
