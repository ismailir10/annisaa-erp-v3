import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ParentBottomNav } from "../bottom-nav";
import { PARENT_MORE_ITEMS } from "../more-sheet";

const nav = vi.hoisted(() => ({ pathname: "/parent", search: "" }));

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
}));

describe("ParentBottomNav", () => {
  beforeEach(() => {
    nav.pathname = "/parent";
    nav.search = "";
  });

  function bar() {
    return screen.getByRole("navigation", { name: "Navigasi utama orang tua" });
  }

  it("renders exactly 5 slots — 4 destinations plus the overflow trigger", () => {
    // The 375px design target allows 375/5 - 16 = 59px of label room. A 6th
    // slot pushed the last tab 27.4px past the viewport at 375px and dropped it
    // entirely at 360px. This ceiling is the fix; do not relax it.
    render(<ParentBottomNav />);

    const links = within(bar()).getAllByRole("link");
    const buttons = within(bar()).getAllByRole("button");
    expect(links).toHaveLength(4);
    expect(buttons).toHaveLength(1);
    expect(links.length + buttons.length).toBe(5);
  });

  it("labels the destinations Beranda, Tagihan, Kehadiran, Jurnal", () => {
    render(<ParentBottomNav />);
    expect(within(bar()).getAllByRole("link").map((l) => l.textContent)).toEqual([
      "Beranda",
      "Tagihan",
      "Kehadiran",
      "Jurnal",
    ]);
  });

  it("keeps the student-journal route slug while showing the Jurnal label", () => {
    // Label-only rename — no redirect, no API path change, no migration.
    render(<ParentBottomNav />);
    expect(within(bar()).getByRole("link", { name: "Jurnal" })).toHaveAttribute(
      "href",
      "/parent/student-journal",
    );
    expect(screen.queryByText("Penghubung")).toBeNull();
  });

  it("does not surface Capaian, Rapor or Profil as top-level tabs", () => {
    render(<ParentBottomNav />);
    for (const item of PARENT_MORE_ITEMS) {
      expect(within(bar()).queryByRole("link", { name: item.label })).toBeNull();
    }
  });

  it("opens the Lainnya sheet with all three overflow destinations", async () => {
    render(<ParentBottomNav />);

    const trigger = within(bar()).getByRole("button", { name: "Lainnya" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(trigger);

    const sheet = await screen.findByRole("navigation", { name: "Menu lainnya" });
    for (const item of PARENT_MORE_ITEMS) {
      expect(within(sheet).getByRole("link", { name: new RegExp(item.label) })).toHaveAttribute(
        "href",
        item.href,
      );
    }
  });

  it("only marks the home tab active on /parent exactly", () => {
    nav.pathname = "/parent/invoices";
    render(<ParentBottomNav />);

    expect(within(bar()).getByRole("link", { name: "Beranda" })).not.toHaveAttribute(
      "aria-current",
    );
    expect(within(bar()).getByRole("link", { name: "Tagihan" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("keeps Lainnya lit while the user is on one of its destinations", () => {
    // Otherwise the bar shows zero active tabs on /parent/reports and the user
    // loses their you-are-here signal.
    nav.pathname = "/parent/reports";
    render(<ParentBottomNav />);

    const trigger = within(bar()).getByRole("button", { name: "Lainnya" });
    expect(trigger.className).toBeDefined();
    expect(within(bar()).getByText("Lainnya").className).toContain("text-primary");
  });

  it("forwards ?child= to every tab and into the sheet, and drops other params", async () => {
    nav.pathname = "/parent/invoices";
    nav.search = "child=abc123&month=2026-08";
    render(<ParentBottomNav />);

    for (const link of within(bar()).getAllByRole("link")) {
      expect(link.getAttribute("href")).toContain("child=abc123");
      expect(link.getAttribute("href")).not.toContain("month");
    }

    await userEvent.click(within(bar()).getByRole("button", { name: "Lainnya" }));
    const sheet = await screen.findByRole("navigation", { name: "Menu lainnya" });
    expect(within(sheet).getByRole("link", { name: /Capaian/ })).toHaveAttribute(
      "href",
      "/parent/perkembangan?child=abc123",
    );
  });
});
