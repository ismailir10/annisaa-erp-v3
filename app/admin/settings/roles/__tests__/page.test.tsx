import { render, screen, waitFor, within } from "@testing-library/react";
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

// Desktop Dialog branch — deterministic regardless of the jsdom matchMedia
// default (see the useZodForm/FormField worked example in holidays' test).
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

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

  it("renders the role name as plain text with no Lihat action (no detail page)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: "role-1",
            name: "Admin Keuangan",
            code: "FINANCE_ADMIN",
            description: null,
            isSystem: false,
            permissions: "[]",
            _count: { users: 0 },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<RolesPage />);

    const name = await screen.findByText("Admin Keuangan");
    expect(name.closest("a")).toBeNull();
    expect(screen.queryByRole("link", { name: /Lihat/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Lihat")).not.toBeInTheDocument();
  });
});

describe("RolesPage create dialog", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("blocks submit with empty Nama and Kode, showing inline errors and firing no POST", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<RolesPage />);

    await user.click(await screen.findByRole("button", { name: "Tambah Peran" }));
    const dialog = await screen.findByRole("dialog", { name: "Tambah Peran" });

    await user.click(within(dialog).getByRole("button", { name: "Tambah Peran" }));

    expect(await within(dialog).findByText("Nama peran wajib diisi")).toBeInTheDocument();
    expect(within(dialog).getByText("Kode wajib diisi")).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "POST"),
    ).toBe(false);
  });

  it("submits the filled form as POST /api/roles with the expected body", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [] }) })
      .mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ id: "role-2" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [] }) });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<RolesPage />);

    await user.click(await screen.findByRole("button", { name: "Tambah Peran" }));
    const dialog = await screen.findByRole("dialog", { name: "Tambah Peran" });

    await user.type(within(dialog).getByLabelText("Nama Peran", { exact: false }), "Admin Keuangan");
    await user.type(within(dialog).getByLabelText("Kode", { exact: false }), "finance_admin");

    await user.click(within(dialog).getByRole("button", { name: "Tambah Peran" }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        ([url, init]) => url === "/api/roles" && (init as RequestInit | undefined)?.method === "POST",
      );
      expect(postCall).toBeTruthy();
    });

    const [, postInit] = fetchMock.mock.calls.find(
      ([url, init]) => url === "/api/roles" && (init as RequestInit | undefined)?.method === "POST",
    )!;
    expect(JSON.parse((postInit as RequestInit).body as string)).toEqual({
      name: "Admin Keuangan",
      code: "FINANCE_ADMIN",
      description: "",
      permissions: [],
    });

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Peran dibuat"));
  });
});
