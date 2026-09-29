import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/attendance/calendar", () => ({ AttendanceCalendar: () => <div /> }));
vi.mock("@/components/teacher/leave-sheet", () => ({
  LeaveSheet: ({ open }: { open: boolean }) => <div data-testid="leave-sheet" data-open={String(open)} />,
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import TeacherAttendancePage from "../page";

afterEach(() => {
  window.history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
});

const stub = () =>
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ records: [], data: [] }) }));

describe("Kehadiran saya ?cuti=1 (X-21)", () => {
  it("opens the leave sheet when arriving from a leave-decision row", async () => {
    stub();
    window.history.replaceState(null, "", "/teacher/attendance?cuti=1");
    render(<TeacherAttendancePage />);
    await waitFor(() => expect(screen.getByTestId("leave-sheet")).toHaveAttribute("data-open", "true"));
  });

  it("leaves the sheet closed on a plain visit", async () => {
    stub();
    window.history.replaceState(null, "", "/teacher/attendance");
    render(<TeacherAttendancePage />);
    expect(screen.getByTestId("leave-sheet")).toHaveAttribute("data-open", "false");
  });
});
