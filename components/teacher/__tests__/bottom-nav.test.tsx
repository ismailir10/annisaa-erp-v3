import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BottomNav } from "../bottom-nav";
import { TEACHER_MORE_ITEMS } from "../more-sheet";

const navigation = vi.hoisted(() => ({ pathname: "/teacher" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));

describe("BottomNav", () => {
  beforeEach(() => {
    navigation.pathname = "/teacher";
  });

  function bar() {
    return screen.getByRole("navigation", { name: "Navigasi utama guru" });
  }

  it("renders five slots: four direct teaching destinations and overflow", () => {
    render(<BottomNav />);

    const links = within(bar()).getAllByRole("link");
    const buttons = within(bar()).getAllByRole("button");
    expect(links.map((link) => link.textContent)).toEqual([
      "Beranda",
      "Absensi",
      "Jurnal",
      "Penilaian",
    ]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/teacher",
      "/teacher/class-attendance",
      "/teacher/student-journal",
      "/teacher/assessments",
    ]);
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAccessibleName("Lainnya");
    expect(links.length + buttons.length).toBe(5);
    expect(within(bar()).queryByRole("link", { name: /^Kehadiran/ })).toBeNull();
  });

  it("opens the teacher overflow sheet with every personal destination", async () => {
    const user = userEvent.setup();
    render(<BottomNav />);

    const trigger = within(bar()).getByRole("button", { name: "Lainnya" });
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);

    const menu = await screen.findByRole("navigation", { name: "Menu lainnya guru" });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    for (const item of TEACHER_MORE_ITEMS) {
      expect(within(menu).getByRole("link", { name: new RegExp(`^${item.label}`) })).toHaveAttribute(
        "href",
        item.href,
      );
    }
  });

  it("keeps direct nested assessment routes active", () => {
    navigation.pathname = "/teacher/assessments/weekly";
    render(<BottomNav />);

    expect(within(bar()).getByRole("link", { name: "Penilaian" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(bar()).getByRole("link", { name: "Beranda" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it.each([
    "/teacher/attendance",
    "/teacher/slips/slip_123",
    "/teacher/profile",
  ])("keeps Lainnya active for %s", (pathname) => {
    navigation.pathname = pathname;
    render(<BottomNav />);

    expect(within(bar()).getByText("Lainnya").className).toContain("text-primary");
    expect(within(bar()).getAllByRole("link")).not.toContainEqual(
      expect.objectContaining({ "aria-current": "page" }),
    );
  });

  it("keeps Lainnya keyboard reachable and active while its sheet is open", async () => {
    const user = userEvent.setup();
    render(<BottomNav />);

    await user.tab();
    await user.tab();
    await user.tab();
    await user.tab();
    await user.tab();
    const trigger = within(bar()).getByRole("button", { name: "Lainnya" });
    expect(trigger).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    // A modal Drawer correctly removes the fixed bar from the accessibility
    // tree. Inspect its existing DOM node rather than asking by role again.
    const hiddenBar = document.querySelector(
      'nav[aria-label="Navigasi utama guru"]',
    );
    expect(hiddenBar).not.toBeNull();
    expect(within(hiddenBar as HTMLElement).getByText("Lainnya").className).toContain(
      "text-primary",
    );
  });

  it("keeps every slot equal-width and focus-visible", () => {
    render(<BottomNav />);

    for (const slot of [...within(bar()).getAllByRole("link"), ...within(bar()).getAllByRole("button")]) {
      expect(slot.className).toContain("basis-0");
      expect(slot.className).toContain("focus-visible:ring-2");
    }
  });
});
