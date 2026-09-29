import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { TeacherHomeClient } from "../home-client";

const base = { today: "2026-09-29", userName: "Sari", todayRecord: null };
const decision = (over: Record<string, unknown>) => ({
  id: "l1",
  leaveType: "ANNUAL",
  startDate: "2026-10-05",
  endDate: "2026-10-06",
  status: "APPROVED" as const,
  reviewNote: null,
  reviewedAt: "2026-09-28T03:00:00.000Z",
  ...over,
});

describe("teacher home: leave decisions (X-21)", () => {
  it("says a leave was approved or rejected, with the admin's reason, and links to it", () => {
    render(
      <TeacherHomeClient
        {...base}
        leaveDecisions={[
          decision({ id: "a" }),
          decision({ id: "r", leaveType: "PERMISSION", status: "REJECTED", startDate: "2026-10-08", endDate: "2026-10-08", reviewNote: "Bentrok ujian" }),
        ]}
      />,
    );
    const section = screen.getByTestId("leave-decisions");
    expect(within(section).getByRole("heading", { name: "Keputusan cuti" })).toBeInTheDocument();
    expect(section).toHaveTextContent("Cuti tahunan disetujui");
    expect(section).toHaveTextContent("Izin ditolak");
    expect(section).toHaveTextContent("Alasan: Bentrok ujian");
    for (const link of within(section).getAllByRole("link")) {
      expect(link).toHaveAttribute("href", "/teacher/attendance?cuti=1");
    }
  });

  it("does not show a section when there is nothing recent to report", () => {
    render(<TeacherHomeClient {...base} leaveDecisions={[]} />);
    expect(screen.queryByTestId("leave-decisions")).toBeNull();
  });
});
