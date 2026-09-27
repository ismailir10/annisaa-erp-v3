/**
 * T6 — Payroll detail's two sub-forms migrated onto useZodForm + FormField +
 * applyServerErrors: Variabel Kehadiran (4 numbers, all optional-default-0,
 * matching the route's own `?? 0`) and Penyesuaian (amount + required
 * reason, live-computed final amount via `watch`). "Setujui Penggajian"
 * (confirm-only) and the summary-card edit toggle are untouched.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({ useParams: () => ({ id: "run-1" }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { toast } from "sonner";
import PayrollDetailPage from "../page";

const item = {
  id: "item-1",
  grossAmount: 5000000,
  deductions: 100000,
  netAmount: 4900000,
  overtimeHours: 0,
  outdoorDays: 0,
  holidayWorkedDays: 0,
  dcDays: 0,
  employee: { id: "e-1", kode: "E-001", nama: "Budi Santoso", jabatan: "Guru Kelas", bankAccountNo: "1234567890", bankName: "BCA" },
  lines: [
    {
      id: "line-1",
      labelSnapshot: "Gaji Pokok",
      categorySnapshot: "INCOME",
      calculatedAmount: 5000000,
      adjustmentAmount: 0,
      adjustmentNote: null,
      finalAmount: 5000000,
      componentDef: { code: "GAPOK", calcType: "FIXED" },
    },
  ],
};

const payrollRun = {
  id: "run-1",
  periodStart: "2026-08-21",
  periodEnd: "2026-09-20",
  actualWorkDays: 22,
  status: "DRAFT",
  items: [item],
};

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400) {
  return { ok, status, json: async () => body };
}

function fixture(overrides: { putStatus?: number; putBody?: unknown } = {}) {
  const { putStatus = 200, putBody = { ok: true } } = overrides;
  const fetchMock = vi.fn((input: string, init?: RequestInit) => {
    if (input === "/api/payroll/run-1") return Promise.resolve(jsonResponse(payrollRun));
    if (input.startsWith("/api/payroll/compare")) return Promise.resolve(jsonResponse({}));
    if (init?.method === "PUT") return Promise.resolve(jsonResponse(putBody, putStatus < 400, putStatus));
    return Promise.resolve(jsonResponse({}));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("PayrollDetailPage — Variabel Kehadiran dialog", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("submits the 4 numbers as PUT .../variables, defaulting blank fields to 0", async () => {
    const fetchMock = fixture();
    const user = userEvent.setup();
    render(<PayrollDetailPage />);

    fireEvent.click(await screen.findByRole("button", { name: /Budi Santoso/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit Variabel Kehadiran" }));

    const dialog = await screen.findByRole("dialog", { name: "Variabel Kehadiran" });
    await user.clear(within(dialog).getByRole("spinbutton", { name: "Jam Lembur" }));
    await user.type(within(dialog).getByRole("spinbutton", { name: "Jam Lembur" }), "2.5");
    await user.clear(within(dialog).getByRole("spinbutton", { name: "Hari Outdoor" }));
    await user.type(within(dialog).getByRole("spinbutton", { name: "Hari Outdoor" }), "1");
    // Hari Libur Kerja / Hari DC left blank.
    await user.clear(within(dialog).getByRole("spinbutton", { name: "Hari Libur Kerja" }));
    await user.clear(within(dialog).getByRole("spinbutton", { name: "Hari DC" }));

    fireEvent.click(within(dialog).getByRole("button", { name: "Simpan & Hitung Ulang" }));

    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find(
        ([url, init]) =>
          url === "/api/payroll/run-1/items/item-1/variables" && (init as RequestInit | undefined)?.method === "PUT",
      );
      expect(putCall).toBeTruthy();
    });
    const [, putInit] = fetchMock.mock.calls.find(
      ([url, init]) =>
        url === "/api/payroll/run-1/items/item-1/variables" && (init as RequestInit | undefined)?.method === "PUT",
    )!;
    expect(JSON.parse((putInit as RequestInit).body as string)).toEqual({
      overtimeHours: 2.5,
      outdoorDays: 1,
      holidayWorkedDays: 0,
      dcDays: 0,
    });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Variabel diperbarui"));
  });

  it("blocks submit on a negative day count, showing an inline error and firing no PUT", async () => {
    const fetchMock = fixture();
    render(<PayrollDetailPage />);

    fireEvent.click(await screen.findByRole("button", { name: /Budi Santoso/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit Variabel Kehadiran" }));
    const dialog = await screen.findByRole("dialog", { name: "Variabel Kehadiran" });

    const dcInput = within(dialog).getByRole("spinbutton", { name: "Hari DC" });
    fireEvent.change(dcInput, { target: { value: "-1" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Simpan & Hitung Ulang" }));

    expect(await within(dialog).findByText("Hari DC tidak boleh negatif")).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "PUT"),
    ).toBe(false);
  });
});

describe("PayrollDetailPage — Penyesuaian dialog", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("blocks submit with an empty reason, showing an inline error and firing no PUT", async () => {
    const fetchMock = fixture();
    render(<PayrollDetailPage />);

    fireEvent.click(await screen.findByRole("button", { name: /Budi Santoso/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit penyesuaian Gaji Pokok" }));

    const dialog = await screen.findByRole("dialog", { name: "Penyesuaian" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Simpan Perubahan" }));

    expect(await within(dialog).findByText("Catatan penyesuaian wajib diisi")).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "PUT"),
    ).toBe(false);
  });

  it("live-recomputes the final amount as the adjustment is typed, then submits amount + note", async () => {
    const fetchMock = fixture();
    const user = userEvent.setup();
    render(<PayrollDetailPage />);

    fireEvent.click(await screen.findByRole("button", { name: /Budi Santoso/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit penyesuaian Gaji Pokok" }));
    const dialog = await screen.findByRole("dialog", { name: "Penyesuaian" });

    expect(within(dialog).getByText(/Final:/)).toHaveTextContent("Rp 5.000.000");

    await user.type(within(dialog).getByRole("spinbutton", { name: "Penyesuaian (+ atau -)" }), "100000");
    await waitFor(() => expect(within(dialog).getByText(/Final:/)).toHaveTextContent("Rp 5.100.000"));

    await user.type(within(dialog).getByRole("textbox", { name: "Catatan" }), "Bonus kinerja");
    fireEvent.click(within(dialog).getByRole("button", { name: "Simpan Perubahan" }));

    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find(
        ([url, init]) =>
          url === "/api/payroll/run-1/items/item-1/lines/line-1" && (init as RequestInit | undefined)?.method === "PUT",
      );
      expect(putCall).toBeTruthy();
    });
    const [, putInit] = fetchMock.mock.calls.find(
      ([url, init]) =>
        url === "/api/payroll/run-1/items/item-1/lines/line-1" && (init as RequestInit | undefined)?.method === "PUT",
    )!;
    expect(JSON.parse((putInit as RequestInit).body as string)).toEqual({
      adjustmentAmount: 100000,
      adjustmentNote: "Bonus kinerja",
    });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Penyesuaian disimpan"));
  });
});
