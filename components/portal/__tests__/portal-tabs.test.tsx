import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PortalTabs, type PortalTab } from "../portal-tabs";

// jsdom does not implement scrollIntoView — stub it so the mount effect doesn't throw.
beforeAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Element.prototype as any).scrollIntoView = vi.fn();
});

const items: PortalTab[] = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Bravo" },
  { id: "c", label: "Charlie" },
  { id: "d", label: "Delta" },
  { id: "e", label: "Echo" },
];

describe("PortalTabs", () => {
  it("renders all 5 tabs", () => {
    render(<PortalTabs items={items} activeId="a" onSelect={() => {}} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(5);
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Echo")).toBeInTheDocument();
  });

  it("marks the active tab with aria-selected=true and others false", () => {
    render(<PortalTabs items={items} activeId="c" onSelect={() => {}} />);
    const active = screen.getByRole("tab", { name: "Charlie" });
    expect(active).toHaveAttribute("aria-selected", "true");

    const inactive = screen.getByRole("tab", { name: "Alpha" });
    expect(inactive).toHaveAttribute("aria-selected", "false");
  });

  it("calls onSelect with the tab id when clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<PortalTabs items={items} activeId="a" onSelect={onSelect} />);

    await user.click(screen.getByRole("tab", { name: "Charlie" }));
    expect(onSelect).toHaveBeenCalledWith("c");
  });

  it("ArrowRight from the active tab moves selection forward", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<PortalTabs items={items} activeId="b" onSelect={onSelect} />);

    const activeTab = screen.getByRole("tab", { name: "Bravo" });
    activeTab.focus();
    await user.keyboard("{ArrowRight}");

    expect(onSelect).toHaveBeenCalledWith("c");
  });

  it("Home selects first tab, End selects last tab", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<PortalTabs items={items} activeId="c" onSelect={onSelect} />);

    const activeTab = screen.getByRole("tab", { name: "Charlie" });
    activeTab.focus();
    await user.keyboard("{Home}");
    expect(onSelect).toHaveBeenLastCalledWith("a");

    await user.keyboard("{End}");
    expect(onSelect).toHaveBeenLastCalledWith("e");
  });

  it("ArrowLeft from the first tab wraps to the last", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<PortalTabs items={items} activeId="a" onSelect={onSelect} />);

    const activeTab = screen.getByRole("tab", { name: "Alpha" });
    activeTab.focus();
    await user.keyboard("{ArrowLeft}");

    expect(onSelect).toHaveBeenCalledWith("e");
  });

  it("renders leading slot content before the label when provided", () => {
    const leadingItems: PortalTab[] = [
      { id: "p", label: "Pak", leading: <span data-testid="lead-p">P</span> },
      { id: "q", label: "Qadr" },
    ];
    render(<PortalTabs items={leadingItems} activeId="p" onSelect={() => {}} />);
    expect(screen.getByTestId("lead-p")).toBeInTheDocument();
    // Leading should be a sibling rendered before the label span inside the same tab button.
    const tab = screen.getByRole("tab", { name: /Pak/ });
    const children = Array.from(tab.children);
    const leadIdx = children.findIndex((c) => c.querySelector('[data-testid="lead-p"]') !== null || c.getAttribute("data-testid") === "lead-p");
    const labelIdx = children.findIndex((c) => c.textContent === "Pak");
    expect(leadIdx).toBeLessThan(labelIdx);
    expect(leadIdx).toBeGreaterThanOrEqual(0);
  });

  it("renders badge count when provided (including 0) and omits when undefined", () => {
    const badgeItems: PortalTab[] = [
      { id: "x", label: "HasCount", count: 3 },
      { id: "y", label: "ZeroCount", count: 0 },
      { id: "z", label: "NoCount" },
    ];
    render(<PortalTabs items={badgeItems} activeId="x" onSelect={() => {}} />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs[0].textContent).toBe("HasCount3");
    expect(tabs[1].textContent).toBe("ZeroCount0");
    expect(tabs[2].textContent).toBe("NoCount");
  });
});
