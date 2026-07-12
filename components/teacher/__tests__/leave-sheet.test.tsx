import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
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
      prefetchLoading={false}
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
    const user = userEvent.setup();

    render(<Harness />);

    await waitFor(() => {
      expect(window.matchMedia).toHaveBeenCalled();
    });

    expect(screen.getByText("Cuti & Izin")).toBeInTheDocument();
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Ajukan Cuti" }));

    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(0);

    await waitFor(() => {
      expect(screen.getByText("Pengajuan akan dikirim ke admin untuk persetujuan")).toBeInTheDocument();
      expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    }, { timeout: 1000 });
  });
});
