// Vitest — Sidebar component cases per cycle p2-portal-shell-sidebar AC5.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Stub db + session so the nav-config → entity-barrel transitive imports
// don't trip DATABASE_URL at module load. Same pattern as nav-config test.
vi.mock("@/lib/db", () => ({
  prisma: {
    student: { findMany: vi.fn(), count: vi.fn() },
    guardian: { findMany: vi.fn(), count: vi.fn() },
    household: { findMany: vi.fn(), count: vi.fn() },
    studentIdentifier: { findMany: vi.fn(), count: vi.fn() },
    guardianInvitation: { findMany: vi.fn(), count: vi.fn() },
  },
}));
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/scaffold/permission", () => ({
  resolvePermissions: vi.fn(),
  ALLOWLIST_CAP: 5000,
}));

const { usePathnameMock } = vi.hoisted(() => ({
  usePathnameMock: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => usePathnameMock(),
}));

import { Sidebar, SIDEBAR_COOKIE_NAME } from "../sidebar";

beforeEach(() => {
  usePathnameMock.mockReturnValue("/");
  // Reset cookies between tests.
  document.cookie = `${SIDEBAR_COOKIE_NAME}=; path=/; max-age=0`;
});

describe("Sidebar", () => {
  it("renders the admin portal title + at least one Akademik label", () => {
    render(<Sidebar portal="admin" />);
    // Desktop title appears in the rail header (multiple "Admin" possible —
    // mobile sheet hidden; rail visible; assert >= 1 occurrence).
    expect(screen.getAllByText("Admin").length).toBeGreaterThanOrEqual(1);
    // Siswa link comes from entity registry — should render exactly once
    // in the desktop rail (mobile sheet is closed by default).
    expect(screen.getAllByText("Siswa").length).toBeGreaterThanOrEqual(1);
  });

  it("renders the teacher portal title", () => {
    render(<Sidebar portal="teacher" />);
    expect(screen.getAllByText("Guru").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Beranda").length).toBeGreaterThanOrEqual(1);
  });

  it("highlights the active route via aria-current='page'", () => {
    usePathnameMock.mockReturnValue("/admin/akademik/siswa");
    render(<Sidebar portal="admin" />);
    const siswaLinks = screen
      .getAllByRole("link", { name: /Siswa/ })
      .filter((el) => el.getAttribute("href") === "/admin/akademik/siswa");
    expect(siswaLinks.length).toBeGreaterThanOrEqual(1);
    expect(siswaLinks[0].getAttribute("aria-current")).toBe("page");
  });

  it("collapse toggle writes cookie", async () => {
    const user = userEvent.setup();
    render(<Sidebar portal="admin" />);
    const toggle = screen.getByRole("button", { name: /Ciutkan navigasi/ });
    await user.click(toggle);
    // After click, cookie set to "1".
    expect(document.cookie).toMatch(new RegExp(`${SIDEBAR_COOKIE_NAME}=1`));
  });

  it("does NOT highlight 'Beranda' when navigated to a nested teacher route (prefix-match guard)", () => {
    usePathnameMock.mockReturnValue("/teacher/kelas");
    render(<Sidebar portal="teacher" />);
    const berandaLinks = screen
      .queryAllByRole("link", { name: /Beranda/ })
      .filter((el) => el.getAttribute("href") === "/teacher");
    // Beranda is mounted (not disabled) but should not be active.
    if (berandaLinks.length > 0) {
      expect(berandaLinks[0].getAttribute("aria-current")).toBeNull();
    }
  });

  it("Esc closes the mobile drawer", async () => {
    const user = userEvent.setup();
    render(<Sidebar portal="admin" />);
    // Open mobile drawer.
    const trigger = screen.getByRole("button", { name: "Buka navigasi" });
    await user.click(trigger);
    // Esc should dismiss it. After dismiss, the trigger regains focus and
    // the drawer popup leaves the DOM (Base UI Dialog removes Popup on close).
    await user.keyboard("{Escape}");
    // Trigger should still be reachable; drawer popup should be gone or
    // hidden. We assert the drawer's title is no longer queryable.
    // SheetTitle inside drawer renders the portal title — close removes it.
    // Use queryByRole with `dialog` semantics.
    const dialogs = screen.queryAllByRole("dialog");
    expect(dialogs.length).toBe(0);
  });
});
