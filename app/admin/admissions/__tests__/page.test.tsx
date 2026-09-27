/**
 * T2 (cycle 2026-09-25, Pendaftaran merge) — /admin/admissions and
 * /admin/enrollments used to be two separate, confusingly-named nav
 * entries. They're now one "Pendaftaran" entry with a link-tab strip
 * ("Calon Siswa" / "Formulir") under the PageHeader so the admin can tell
 * which sub-view they're in and jump to the other. This guards that the
 * strip renders on the admissions page with "Calon Siswa" marked current.
 *
 * Companion coverage for the conversion-eligibility logic lives in
 * `page.test.ts` (node env, no DOM) — unchanged by this cycle.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import AdmissionsPage from "@/app/admin/admissions/page";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/admissions",
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

function stubFetch() {
  return vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/admissions")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          data: [],
          pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
          canEdit: true,
        }),
      } as Response);
    }
    if (url.includes("/api/programs")) {
      return Promise.resolve({ ok: true, json: async () => [] } as Response);
    }
    if (url.includes("/api/config/campuses")) {
      return Promise.resolve({ ok: true, json: async () => [] } as Response);
    }
    return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
  });
}

describe("AdmissionsPage — Pendaftaran tab strip", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", stubFetch());
  });

  it("renders the Calon Siswa / Formulir strip with Calon Siswa marked current", async () => {
    render(<AdmissionsPage />);

    const calonSiswa = await screen.findByRole("link", { name: "Calon Siswa" });
    expect(calonSiswa).toHaveAttribute("href", "/admin/admissions");
    expect(calonSiswa).toHaveAttribute("aria-current", "page");

    const formulir = screen.getByRole("link", { name: "Formulir" });
    expect(formulir).toHaveAttribute("href", "/admin/enrollments");
    expect(formulir).not.toHaveAttribute("aria-current");
  });
});

// T4 (2026-09-27, admin-forms-rhf) — "Catat Pertanyaan" now runs on
// react-hook-form + zodResolver (`createAdmissionSchema`, reused as-is —
// every field the form edits already used `optionalTrimmed`/`optionalEnum`).
describe("AdmissionsPage — Catat Pertanyaan dialog (RHF)", () => {
  function stubFetchTrackingPost() {
    return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/admissions") && init?.method === "POST") {
        return Promise.resolve({ ok: true, json: async () => ({ id: "a1" }) } as Response);
      }
      if (url.includes("/api/admissions")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: [],
            pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
            canEdit: true,
          }),
        } as Response);
      }
      if (url.includes("/api/programs")) {
        return Promise.resolve({ ok: true, json: async () => [] } as Response);
      }
      if (url.includes("/api/config/campuses")) {
        return Promise.resolve({ ok: true, json: async () => [] } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
    });
  }

  beforeEach(() => {
    vi.stubGlobal("fetch", stubFetchTrackingPost());
  });

  it("blocks an empty submit with inline errors and sends no request", async () => {
    const user = userEvent.setup();
    render(<AdmissionsPage />);

    await user.click(await screen.findByRole("button", { name: "Catat Pertanyaan" }));
    const dialog = await screen.findByRole("dialog", { name: "Catat Pertanyaan Baru" });

    const fetchSpy = vi.mocked(fetch);
    fetchSpy.mockClear();

    await user.click(within(dialog).getByRole("button", { name: "Catat Pertanyaan" }));

    expect(await within(dialog).findByText("Nama anak wajib diisi")).toBeInTheDocument();
    expect(within(dialog).getByText("Nama orang tua wajib diisi")).toBeInTheDocument();
    expect(
      fetchSpy.mock.calls.some(
        ([reqUrl, init]) => String(reqUrl).includes("/api/admissions") && (init as RequestInit | undefined)?.method === "POST",
      ),
    ).toBe(false);
  });

  it("sends a POST with the filled fields on a valid submit", async () => {
    const user = userEvent.setup();
    render(<AdmissionsPage />);

    await user.click(await screen.findByRole("button", { name: "Catat Pertanyaan" }));
    const dialog = await screen.findByRole("dialog", { name: "Catat Pertanyaan Baru" });

    await user.type(within(dialog).getByLabelText(/^Nama Anak\*?$/), "Aisyah");
    await user.type(within(dialog).getByLabelText(/^Nama Orang Tua\*?$/), "Ibu Fatimah");

    await user.click(within(dialog).getByRole("button", { name: "Catat Pertanyaan" }));

    const { toast } = await import("sonner");
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Pendaftaran tercatat"));

    const postCall = vi.mocked(fetch).mock.calls.find(
      ([reqUrl, init]) => String(reqUrl).includes("/api/admissions") && (init as RequestInit | undefined)?.method === "POST",
    );
    expect(postCall).toBeTruthy();
    const [, postInit] = postCall as [string, RequestInit];
    const body = JSON.parse(postInit.body as string);
    expect(body.childName).toBe("Aisyah");
    expect(body.parentName).toBe("Ibu Fatimah");
  });
});
