import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PortalHeader } from "../portal-header";

describe("PortalHeader", () => {
  it("renders brand label + logo + first name + fallback initial", () => {
    render(
      <PortalHeader
        userName="Siti Nurhaliza Hidayat"
        avatarFallback="SN"
        onLogout={() => {}}
      />,
    );
    expect(screen.getByText("Talib")).toBeInTheDocument();
    expect(screen.getByText("Siti")).toBeInTheDocument();
    expect(screen.getByText("SN")).toBeInTheDocument();
  });

  it("renders subtitle when provided", () => {
    render(
      <PortalHeader
        userName="Budi"
        userSubtitle="2 anak"
        avatarFallback="B"
        onLogout={() => {}}
      />,
    );
    expect(screen.getByText("2 anak")).toBeInTheDocument();
  });

  it("wraps user block in a link when profileHref provided", () => {
    render(
      <PortalHeader
        userName="Bu Sari"
        avatarFallback="BS"
        profileHref="/teacher/profile"
        onLogout={() => {}}
      />,
    );
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/teacher/profile");
    expect(link).toContainElement(screen.getByText("Bu"));
  });

  it("has no profile link when profileHref is absent", () => {
    render(
      <PortalHeader userName="Budi" avatarFallback="B" onLogout={() => {}} />,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("fires onLogout when the logout button is clicked", async () => {
    const onLogout = vi.fn();
    const user = userEvent.setup();
    render(
      <PortalHeader userName="Budi" avatarFallback="B" onLogout={onLogout} />,
    );
    await user.click(screen.getByRole("button", { name: "Keluar" }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it("prefers avatarUrl over fallback initials when provided", () => {
    const { container } = render(
      <PortalHeader
        userName="Budi"
        avatarUrl="/avatars/budi.jpg"
        avatarFallback="B"
        onLogout={() => {}}
      />,
    );
    const avatarImg = container.querySelector('img[alt=""]') as HTMLImageElement | null;
    expect(avatarImg).not.toBeNull();
    expect(avatarImg!.src).toContain("/avatars/budi.jpg");
    expect(screen.queryByText("B")).not.toBeInTheDocument();
  });
});
