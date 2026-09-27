/**
 * T7 (cycle 2026-09-26, admin-ui-standard-c1) — the guardians list used to
 * render the name as a raw `<button onClick={() => router.push(...)}>`
 * *and* a separate "Lihat" row action doing the same navigation. Both are
 * now one `DataTableLinkCell` `<Link>`; `DataTableRowActions` no longer gets
 * `onView` for this list.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

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
