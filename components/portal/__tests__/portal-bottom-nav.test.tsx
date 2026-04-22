import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Home, Settings, User } from "lucide-react";
import { PortalBottomNav } from "../portal-bottom-nav";

vi.mock("next/navigation", () => ({
  usePathname: () => "/foo/settings",
}));

describe("PortalBottomNav", () => {
  const items = [
    { label: "Home", href: "/foo", icon: Home },
    { label: "Settings", href: "/foo/settings", icon: Settings },
    { label: "Profile", href: "/foo/profile", icon: User },
  ];

  it("renders nav with aria-label and all items as links", () => {
    render(<PortalBottomNav items={items} ariaLabel="Test nav" />);
    const nav = screen.getByRole("navigation", { name: "Test nav" });
    expect(nav).toBeInTheDocument();
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(3);
  });

  it("marks the active item with aria-current=page", () => {
    render(<PortalBottomNav items={items} ariaLabel="Test nav" />);
    const active = screen.getByRole("link", { name: "Settings" });
    expect(active).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Profile" })).not.toHaveAttribute("aria-current");
  });
});
