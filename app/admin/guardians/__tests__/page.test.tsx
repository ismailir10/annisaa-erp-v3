/**
 * T7 (cycle 2026-09-26, admin-ui-standard-c1) — the guardians list used to
 * render the name as a raw `<button onClick={() => router.push(...)}>`
 * *and* a separate "Lihat" row action doing the same navigation. Both are
 * now one `DataTableLinkCell` `<Link>`; `DataTableRowActions` no longer gets
 * `onView` for this list.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";

import GuardiansPage from "@/app/admin/guardians/page";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const guardian = {
  id: "g1",
  name: "Ibu Fatimah",
  email: "fatimah@example.com",
  phone: "081234567890",
  whatsapp: null,
  status: "ACTIVE",
  _count: { guardians: 1 },
  guardians: [{ student: { id: "s1", name: "Aisyah" } }],
};

function stubFetch() {
  return vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/guardians?pageSize=1")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ data: [], pagination: { page: 1, pageSize: 1, total: 1, totalPages: 1 } }),
      } as Response);
    }
    if (url.includes("/api/guardians?")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          data: [guardian],
          pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        }),
      } as Response);
    }
    return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
  });
}

describe("GuardiansPage — name is the link (T7)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", stubFetch());
  });

  it("renders the guardian name as a link to the detail page and drops the separate Lihat button", async () => {
    render(<GuardiansPage />);

    await waitFor(() => {
      expect(screen.queryByText("Belum ada wali terdaftar")).not.toBeInTheDocument();
    });

    const nameLink = await screen.findByRole("link", { name: "Ibu Fatimah" });
    expect(nameLink).toHaveAttribute("href", "/admin/guardians/g1");
    expect(screen.queryByRole("button", { name: /^Lihat/ })).not.toBeInTheDocument();
  });
});

// T4 (2026-09-27, admin-forms-rhf) — the Edit Wali dialog now runs on
// react-hook-form + zodResolver (`parentFormSchema`, lib/validations/parent.ts)
// instead of a bare useState + fetch. `GuardianFormBody` itself is untouched
// (shared with the out-of-scope Student/Guardian detail pages), so a client
// validation failure has no inline field slot to render into — it surfaces
// as a toast instead (see the `handleEditSave` onInvalid handler).
describe("GuardiansPage — Edit Wali dialog (RHF)", () => {
  function stubFetchWithParent() {
    return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/guardians?pageSize=1")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: [], pagination: { page: 1, pageSize: 1, total: 1, totalPages: 1 } }),
        } as Response);
      }
      if (url.includes("/api/guardians?")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: [guardian],
            pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
          }),
        } as Response);
      }
      if (url.includes("/api/parents/g1") && (!init || init.method === undefined)) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: "g1",
            name: "Ibu Fatimah",
            email: "fatimah@example.com",
            phone: "081234567890",
            whatsapp: null,
            address: null,
            nik: null,
            education: null,
            occupation: null,
            employer: null,
            employerAddress: null,
            employerCity: null,
            incomeRange: null,
            childrenTotal: null,
            guardians: [],
          }),
        } as Response);
      }
      if (url.includes("/api/parents/g1") && init?.method === "PUT") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ id: "g1" }),
        } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
    });
  }

  beforeEach(() => {
    vi.stubGlobal("fetch", stubFetchWithParent());
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  async function openEditDialog(user: ReturnType<typeof userEvent.setup>) {
    render(<GuardiansPage />);
    await screen.findByText("Ibu Fatimah");
    // Base UI Menu — real pointer sequence via userEvent, not fireEvent
    // (see app/admin/fees/__tests__/page.test.tsx for the same pattern).
    await user.click(await screen.findByRole("button", { name: "Aksi untuk Ibu Fatimah" }));
    await user.click(await screen.findByRole("menuitem", { name: "Ubah" }));
    return screen.findByRole("dialog", { name: "Edit Wali" });
  }

  it("blocks submit and shows a toast when Nama is cleared, without sending a request", async () => {
    const user = userEvent.setup();
    const dialog = await openEditDialog(user);

    const nameInput = await within(dialog).findByLabelText(/^Nama\*?$/);
    await user.clear(nameInput);

    const fetchSpy = vi.mocked(fetch);
    fetchSpy.mockClear();

    await user.click(within(dialog).getByRole("button", { name: "Simpan Perubahan" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Nama wajib diisi"));
    expect(fetchSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("/api/parents/g1"),
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("submits a PUT with the edited fields on a valid save", async () => {
    const user = userEvent.setup();
    const dialog = await openEditDialog(user);

    const phoneInput = await within(dialog).findByLabelText("No. HP");
    await user.clear(phoneInput);
    await user.type(phoneInput, "089999999999");

    await user.click(within(dialog).getByRole("button", { name: "Simpan Perubahan" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Data wali diperbarui"));

    const putCall = vi.mocked(fetch).mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === "PUT",
    );
    expect(putCall).toBeTruthy();
    const [putUrl, putInit] = putCall as [string, RequestInit];
    expect(putUrl).toContain("/api/parents/g1");
    const body = JSON.parse(putInit.body as string);
    expect(body.phone).toBe("089999999999");
    expect(body.name).toBe("Ibu Fatimah");
  });
});
