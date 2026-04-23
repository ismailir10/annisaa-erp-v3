import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CardListItem } from "../card-list-item";

describe("CardListItem", () => {
  it("renders as a Link with auto-appended chevron when href is provided", () => {
    const { container } = render(
      <CardListItem href="/parent/children/123" primary="Ahmad Zafran" />
    );
    const link = container.querySelector("a");
    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).toBe("/parent/children/123");
    // Auto-chevron present (aria-hidden lucide icon rendered as svg)
    expect(link?.querySelector("svg")).not.toBeNull();
    expect(screen.getByText("Ahmad Zafran")).toBeInTheDocument();
  });

  it("renders as a button with auto-appended chevron when onClick is provided", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<CardListItem onClick={onClick} primary="Tap me" />);
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("type")).toBe("button");
    expect(btn.querySelector("svg")).not.toBeNull();
    await user.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders as a static div without chevron when neither href nor onClick is provided", () => {
    const { container } = render(<CardListItem primary="Static row" />);
    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector("button")).toBeNull();
    // Static div — no chevron auto-appended
    expect(container.querySelector("svg")).toBeNull();
    expect(screen.getByText("Static row")).toBeInTheDocument();
  });

  it("suppresses auto-chevron when the consumer supplies a trailing slot", () => {
    const { container } = render(
      <CardListItem
        href="/parent/invoices/abc"
        primary="April 2026"
        trailing={<span data-testid="chip">Unpaid</span>}
      />
    );
    // Consumer trailing rendered
    expect(screen.getByTestId("chip")).toBeInTheDocument();
    // No auto-chevron svg — consumer owns the trailing column
    expect(container.querySelector("svg")).toBeNull();
  });

  it("renders leading, secondary, and meta slots when provided", () => {
    render(
      <CardListItem
        href="/x"
        leading={<span data-testid="leading">L</span>}
        primary="Primary"
        secondary="Secondary"
        meta="Meta caption"
      />
    );
    expect(screen.getByTestId("leading")).toBeInTheDocument();
    expect(screen.getByText("Secondary")).toBeInTheDocument();
    expect(screen.getByText("Meta caption")).toBeInTheDocument();
  });

  it("renders as a non-interactive div with pointer-events disabled when disabled", () => {
    const onClick = vi.fn();
    const { container } = render(
      <CardListItem disabled onClick={onClick} primary="Disabled row" />
    );
    // Degrades to div — no button, no link
    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("pointer-events-none");
    expect(root.className).toContain("opacity-60");
  });
});
