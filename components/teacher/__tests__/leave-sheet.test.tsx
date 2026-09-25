import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LeaveSheet, type LeaveBalance, type LeaveRequest } from "../leave-sheet";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const balance: LeaveBalance = {
  annual: { total: 12, used: 2, remaining: 10 },
  sick: { total: 12, used: 0, remaining: 12 },
};

const requests: LeaveRequest[] = [
  {
    id: "leave-1",
    leaveType: "ANNUAL",
    startDate: "2026-06-15",
    endDate: "2026-06-16",
    days: 2,
    reason: "Urusan keluarga",
    status: "APPROVED",
    reviewNote: null,
    createdAt: "2026-06-01",
  },
];

function Harness() {
  const [open, setOpen] = useState(true);
  return (
    <LeaveSheet
      open={open}
      onOpenChange={setOpen}
      prefetchedBalance={balance}
      prefetchedRequests={requests}
      prefetchState="ready"
    />
  );
}

describe("LeaveSheet", () => {
  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: 375,
    });
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: true,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it("hands off from sheet to request dialog without stacking overlays", async () => {
    render(<Harness />);

    await waitFor(() => {
      expect(window.matchMedia).toHaveBeenCalled();
    });

    expect(screen.getByText("Cuti dan izin")).toBeInTheDocument();
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);

    // `fireEvent`, not `user.click`, on purpose. LeaveSheet's
    // `openAfterSheetCloses` closes the sheet and opens the next overlay on a
    // real SHEET_CLOSE_TRANSITION_MS (240ms) timer, so "no overlay is up yet"
    // is a *window*, not a state. `await user.click` yields to the event loop
    // several times, and on a loaded runner those 240ms elapse inside it —
    // the dialog is already open and the assertion goes red for nothing. It
    // did, in 6 of 10 stressed full-suite runs. `fireEvent.click` is
    // synchronous, so no timer can fire between it and the assertion below,
    // whatever the machine is doing.
    fireEvent.click(screen.getByRole("button", { name: "Ajukan cuti" }));

    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(0);

    // ...and exactly one once the timer fires — never two.
    await waitFor(() => {
      expect(screen.getByText("Pengajuan akan dikirim ke admin untuk persetujuan")).toBeInTheDocument();
      expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    });
  });

  it("associates every leave-request control with its visible label", async () => {
    const user = userEvent.setup();

    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Ajukan cuti" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Jenis cuti")).toBeInTheDocument();
    });
    expect(screen.getByLabelText("Tanggal mulai")).toBeInTheDocument();
    expect(screen.getByLabelText("Tanggal selesai")).toBeInTheDocument();
    expect(screen.getByLabelText("Alasan")).toBeInTheDocument();
  });

  it("shows a retryable error instead of an empty state when leave prefetch fails", async () => {
    const onRefetch = vi.fn();
    const user = userEvent.setup();

    render(
      <LeaveSheet
        open
        onOpenChange={() => {}}
        prefetchedBalance={null}
        prefetchedRequests={null}
        prefetchState="error"
        onRefetch={onRefetch}
      />,
    );

    expect(screen.getByText("Data cuti tidak bisa dimuat")).toBeInTheDocument();
    expect(screen.queryByText("Belum ada pengajuan cuti")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Coba lagi" }));
    expect(onRefetch).toHaveBeenCalledTimes(1);
  });
});
