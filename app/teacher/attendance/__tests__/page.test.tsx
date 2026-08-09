import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ error: vi.fn() }));
const calendar = vi.hoisted(() => ({
  onMonthChange: undefined as undefined | ((month: number, year: number) => void),
}));

vi.mock("@/components/attendance/calendar", () => ({
  AttendanceCalendar: ({
    records,
    month,
    year,
    onMonthChange,
  }: {
    records: Array<{ id: string }>;
    month: number;
    year: number;
    onMonthChange: (month: number, year: number) => void;
  }) => (
    <div>
      {(() => {
        calendar.onMonthChange = onMonthChange;
        return null;
      })()}
      <div data-testid="attendance-calendar">{records[0]?.id ?? "empty"}</div>
      <button
        type="button"
        onClick={() => {
          const nextMonth = month === 12 ? 1 : month + 1;
          onMonthChange(nextMonth, month === 12 ? year + 1 : year);
        }}
      >
        Bulan berikutnya
      </button>
    </div>
  ),
}));

vi.mock("@/components/teacher/leave-sheet", () => ({
  LeaveSheet: () => null,
}));

vi.mock("sonner", () => ({ toast }));

import TeacherAttendancePage from "../page";

const ok = (data: unknown) => ({
  ok: true,
  json: async () => data,
});

describe("TeacherAttendancePage month recovery", () => {
  beforeEach(() => {
    toast.error.mockReset();
  });

  it("shows a retryable current-month failure without surfacing adjacent-prefetch failures", async () => {
    let attendanceCalls = 0;
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      if (url.startsWith("/api/attendance/my")) {
        attendanceCalls += 1;
        if (attendanceCalls <= 3) return Promise.reject(new Error("offline"));
        return Promise.resolve(ok([{ id: "record-1" }]));
      }
      return Promise.resolve(ok([]));
    }));

    render(<TeacherAttendancePage />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Kehadiran tidak bisa dimuat");
    });
    expect(screen.queryByTestId("attendance-calendar")).not.toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Coba lagi" }));

    await waitFor(() => {
      expect(screen.getByTestId("attendance-calendar")).toHaveTextContent("record-1");
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it("keeps the newest cached month when a slower prior foreground request resolves", async () => {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
    const nextYear = currentMonth === 12 ? currentYear + 1 : currentYear;
    const slowMonth = nextMonth === 12 ? 1 : nextMonth + 1;
    const slowYear = nextMonth === 12 ? nextYear + 1 : nextYear;
    let resolveSlow: ((value: ReturnType<typeof ok>) => void) | undefined;

    vi.stubGlobal("fetch", vi.fn((url: string) => {
      if (url.startsWith("/api/attendance/my")) {
        if (url.includes(`month=${slowMonth}&year=${slowYear}`)) {
          return new Promise((resolve) => {
            resolveSlow = resolve as (value: ReturnType<typeof ok>) => void;
          });
        }
        if (url.includes(`month=${nextMonth}&year=${nextYear}`)) {
          return Promise.resolve(ok([{ id: "month-b" }]));
        }
        return Promise.resolve(ok([{ id: "initial-month" }]));
      }
      return Promise.resolve(ok([]));
    }));

    render(<TeacherAttendancePage />);

    await waitFor(() => {
      expect(screen.getByTestId("attendance-calendar")).toHaveTextContent("initial-month");
    });
    act(() => calendar.onMonthChange?.(slowMonth, slowYear));
    await waitFor(() => {
      expect(resolveSlow).toBeDefined();
    });
    // Invoke the latest calendar callback directly while month A is loading:
    // the production calendar replaces its controls with a loading state.
    act(() => calendar.onMonthChange?.(nextMonth, nextYear));

    await waitFor(() => {
      expect(screen.getByTestId("attendance-calendar")).toHaveTextContent("month-b");
    });

    await act(async () => {
      resolveSlow?.(ok([{ id: "month-a" }]));
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(screen.getByTestId("attendance-calendar")).toHaveTextContent("month-b");
    });
  });
});
