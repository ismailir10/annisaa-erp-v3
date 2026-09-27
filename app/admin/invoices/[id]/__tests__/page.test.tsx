/**
 * T6 (2026-09-27 admin-finish-standard) — the "Catat Pembayaran" dialog
 * migrated from a 4-field `useState` onto react-hook-form + zod
 * (`invoicePaymentFormSchema`, lib/validations/invoice.ts). POST
 * /api/invoices/[id]/payments switched from ad-hoc `safeParse` to
 * `validateBody` (same `recordPaymentSchema`) so a rejected amount maps back
 * onto the Jumlah field instead of only a generic toast.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({ useParams: () => ({ id: "inv-1" }) }));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { toast } from "sonner";
import InvoiceDetailPage from "../page";

const invoice = {
  capabilities: { create: true, recordPayment: true, void: true },
  id: "inv-1",
  invoiceNumber: "INV-2026-001",
  periodLabel: "September 2026",
  dueDate: "2026-09-30",
  totalDue: 1000000,
  totalPaid: 400000,
  status: "PARTIALLY_PAID",
  xenditPaymentUrl: null,
  paymentLinkError: null,
  student: { name: "Ahmad", nickname: null, guardians: [] },
  lines: [],
  payments: [],
};

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400) {
  return { ok, status, json: async () => body };
}

function fixture(overrides: { postStatus?: number; postBody?: unknown } = {}) {
  const { postStatus = 201, postBody = { id: "pay-1" } } = overrides;
  const fetchMock = vi.fn((input: string, init?: RequestInit) => {
    if (input === "/api/invoices/inv-1/payments" && init?.method === "POST") {
      return Promise.resolve(jsonResponse(postBody, postStatus < 400, postStatus));
    }
    if (input === "/api/invoices/inv-1") return Promise.resolve(jsonResponse(invoice));
    // PaymentActivityCard always fetches this on mount and expects an array.
    if (input === "/api/invoices/inv-1/webhook-events") return Promise.resolve(jsonResponse([]));
    return Promise.resolve(jsonResponse({}));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("InvoiceDetailPage — Catat Pembayaran dialog", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("blocks an empty amount with 'Jumlah pembayaran wajib diisi' and sends no POST", async () => {
    const fetchMock = fixture();
    const user = userEvent.setup();
    render(<InvoiceDetailPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Catat Pembayaran" }));
    const dialog = await screen.findByRole("dialog", { name: "Catat Pembayaran" });
    await user.clear(within(dialog).getByRole("textbox", { name: "Jumlah" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Catat Pembayaran" }));

    expect(await within(dialog).findByText("Jumlah pembayaran wajib diisi")).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "POST"),
    ).toBe(false);
  });

  it("submits amount + method + reference + notes as the POST body", async () => {
    const fetchMock = fixture();
    const user = userEvent.setup();
    render(<InvoiceDetailPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Catat Pembayaran" }));
    const dialog = await screen.findByRole("dialog", { name: "Catat Pembayaran" });
    // Amount is left at its default (the invoice's remaining balance).
    await user.type(within(dialog).getByRole("textbox", { name: "Referensi" }), "TRX-001");
    fireEvent.click(within(dialog).getByRole("button", { name: "Catat Pembayaran" }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        ([url, init]) =>
          url === "/api/invoices/inv-1/payments" && (init as RequestInit | undefined)?.method === "POST",
      );
      expect(postCall).toBeTruthy();
    });
    const [, postInit] = fetchMock.mock.calls.find(
      ([url, init]) =>
        url === "/api/invoices/inv-1/payments" && (init as RequestInit | undefined)?.method === "POST",
    )!;
    expect(JSON.parse((postInit as RequestInit).body as string)).toEqual({
      amount: 600000, // totalDue (1,000,000) - totalPaid (400,000)
      method: "CASH",
      reference: "TRX-001",
      notes: "",
    });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Pembayaran dicatat"));
  });

  it("maps a validateBody field error from the server back onto Jumlah", async () => {
    fixture({
      postStatus: 400,
      postBody: { error: "Validasi gagal", errors: [{ field: "amount", message: "Jumlah harus lebih dari 0" }] },
    });
    const user = userEvent.setup();
    render(<InvoiceDetailPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Catat Pembayaran" }));
    const dialog = await screen.findByRole("dialog", { name: "Catat Pembayaran" });
    const amountInput = within(dialog).getByRole("textbox", { name: "Jumlah" });
    await user.clear(amountInput);
    await user.type(amountInput, "1");
    fireEvent.click(within(dialog).getByRole("button", { name: "Catat Pembayaran" }));

    expect(await within(dialog).findByText("Jumlah harus lebih dari 0")).toBeInTheDocument();
  });
});
