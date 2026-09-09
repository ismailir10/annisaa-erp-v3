import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ClassDayGrid } from "@/components/student-journal/class-day-grid";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const students = [
  { id: "s1", name: "Abdullah Faris Siregar", nickname: "Abdullah" },
  { id: "s2", name: "Ali Arif Wibowo", nickname: "Ali" },
];

const categories = [
  {
    id: "cat-1",
    name: "Ibadah",
    order: 1,
    indicators: [{ id: "ind-1", label: "Mengikuti doa pembuka", order: 1 }],
  },
];

describe("ClassDayGrid — unread catatan badge", () => {
  it("badges only the students with catatan the guru has not read", () => {
    render(
      <ClassDayGrid
        students={students}
        categories={categories}
        state={{}}
        onToggle={vi.fn()}
        unreadCounts={{ s1: 2 }}
      />,
    );

    const badges = screen.getAllByTestId("unread-badge");
    expect(badges).toHaveLength(1);
    expect(badges[0]).toHaveTextContent("2 baru");
    expect(badges[0]).toHaveAttribute(
      "aria-label",
      "2 catatan baru untuk Abdullah Faris Siregar",
    );
  });

  it("renders no badge at all when nothing is unread", () => {
    render(
      <ClassDayGrid
        students={students}
        categories={categories}
        state={{}}
        onToggle={vi.fn()}
        unreadCounts={{}}
      />,
    );

    expect(screen.queryByTestId("unread-badge")).toBeNull();
  });
});
