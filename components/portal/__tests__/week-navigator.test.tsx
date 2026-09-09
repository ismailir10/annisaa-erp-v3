import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WeekNavigator } from "@/components/portal/week-navigator";

describe("WeekNavigator", () => {
  it("keeps both controls live and renders no reset when neither opt-in is passed", () => {
    render(<WeekNavigator label="10 Agu – 14 Agu 2026" onPrev={vi.fn()} onNext={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Pekan sebelumnya" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Pekan berikutnya" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Kembali ke pekan ini" })).toBeNull();
  });

  it("disables next — and says why — when the next week cannot hold data", () => {
    const onNext = vi.fn();
    render(
      <WeekNavigator
        label="24 Agu – 28 Agu 2026 · pekan ini"
        onPrev={vi.fn()}
        onNext={onNext}
        nextDisabled
      />,
    );

    const next = screen.getByRole("button", {
      name: "Pekan berikutnya — pekan berikutnya belum tersedia",
    });
    expect(next).toBeDisabled();
    fireEvent.click(next);
    expect(onNext).not.toHaveBeenCalled();
  });

  it("renders the reset as a real control when a handler is supplied", () => {
    const onToday = vi.fn();
    render(
      <WeekNavigator label="3 Agu – 7 Agu 2026" onPrev={vi.fn()} onNext={vi.fn()} onToday={onToday} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Kembali ke pekan ini" }));
    expect(onToday).toHaveBeenCalledTimes(1);
  });

  it("still disables next in href mode rather than rendering a dead link", () => {
    render(
      <WeekNavigator
        label="24 Agu – 28 Agu 2026"
        prevHref="/parent/attendance?week=2026-08-17"
        nextHref="/parent/attendance?week=2026-08-31"
        nextDisabled
      />,
    );

    expect(screen.getByRole("link", { name: "Pekan sebelumnya" })).toHaveAttribute(
      "href",
      "/parent/attendance?week=2026-08-17",
    );
    expect(
      screen.queryByRole("link", { name: "Pekan berikutnya" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", {
        name: "Pekan berikutnya — pekan berikutnya belum tersedia",
      }),
    ).toBeDisabled();
  });
});
