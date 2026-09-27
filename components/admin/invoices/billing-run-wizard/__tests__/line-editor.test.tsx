/**
 * T6 — the line-editor "Hapus baris tagihan" confirm was a raw AlertDialog;
 * it now goes through the shared ConfirmDialog (ui.md Overlays Rule). These
 * tests drive `EditableRowLines`'s delete-line flow end to end against a
 * stubbed fetch to prove open/confirm/cancel still behave, including the
 * confirm-stays-open-on-error case ConfirmDialog's own catch swallows.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { EditableRowLines } from "../line-editor";
import type { BillingRunRowData } from "../types";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

function row(): BillingRunRowData {
  return {
    id: "row-1",
    billingRunId: "run-1",
    studentId: "stu-1",
    studentNameSnapshot: "Bilal Ahmad",
    classLabelSnapshot: "KB 1",
    parentId: "parent-1",
    totalDue: 500_000,
    status: "PENDING",
    invoiceId: null,
    error: null,
    lines: [
      {
        id: "line-1",
        feeComponentId: "fee-1",
        labelSnapshot: "SPP September",
        amount: 500_000,
        adjustmentAmount: 0,
        adjustmentNote: null,
        finalAmount: 500_000,
        source: "CATALOG",
      },
    ],
  };
}

function renderLines(onLineRemoved = vi.fn()) {
  render(
    <EditableRowLines
      runId="run-1"
      row={row()}
      feeComponents={[]}
      onLineUpdated={vi.fn()}
      onLineAdded={vi.fn()}
      onLineRemoved={onLineRemoved}
    />,
  );
  return { onLineRemoved };
}

describe("EditableRowLines — delete-line ConfirmDialog (T6)", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens the confirm with the line's label and cancels without deleting", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { onLineRemoved } = renderLines();

    await user.click(screen.getByRole("button", { name: "Hapus baris SPP September" }));

    expect(await screen.findByText("Hapus baris tagihan ini?")).toBeInTheDocument();
    expect(
      screen.getByText(/"SPP September" akan dihapus dari tagihan Bilal Ahmad/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Batal" }));

    await waitFor(() => {
      expect(screen.queryByText("Hapus baris tagihan ini?")).not.toBeInTheDocument();
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onLineRemoved).not.toHaveBeenCalled();
  });

  it("confirms and removes the line on success", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ totalDue: 0 }),
      }),
    );
    const { onLineRemoved } = renderLines();

    await user.click(screen.getByRole("button", { name: "Hapus baris SPP September" }));
    await screen.findByText("Hapus baris tagihan ini?");

    await user.click(screen.getByRole("button", { name: "Ya, Hapus" }));

    await waitFor(() => expect(onLineRemoved).toHaveBeenCalledWith("line-1", 0));
    await waitFor(() => {
      expect(screen.queryByText("Hapus baris tagihan ini?")).not.toBeInTheDocument();
    });
  });

  it("keeps the dialog open and toasts an error when the delete fails", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: "Baris terakhir tidak bisa dihapus" }),
      }),
    );
    const { onLineRemoved } = renderLines();

    await user.click(screen.getByRole("button", { name: "Hapus baris SPP September" }));
    await screen.findByText("Hapus baris tagihan ini?");

    await user.click(screen.getByRole("button", { name: "Ya, Hapus" }));

    const { toast } = await import("sonner");
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Baris terakhir tidak bisa dihapus"),
    );
    expect(screen.getByText("Hapus baris tagihan ini?")).toBeInTheDocument();
    expect(onLineRemoved).not.toHaveBeenCalled();
  });
});
