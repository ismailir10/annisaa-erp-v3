import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { signOut, toastError, push } = vi.hoisted(() => ({
  signOut: vi.fn(),
  toastError: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/lib/sign-out", () => ({ signOut }));
vi.mock("sonner", () => ({ toast: { error: toastError } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { LogoutButton } from "../logout-button";

beforeEach(() => vi.clearAllMocks());

describe("parent profile LogoutButton (PAR-1)", () => {
  it("signs out through the full-navigation helper, never router.push", async () => {
    signOut.mockResolvedValue(undefined);
    render(<LogoutButton />);
    await userEvent.click(screen.getByRole("button", { name: "Keluar" }));
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  it("shows an error and re-enables the button when sign-out fails", async () => {
    signOut.mockRejectedValue(new Error("nope"));
    render(<LogoutButton />);
    await userEvent.click(screen.getByRole("button", { name: "Keluar" }));
    expect(toastError).toHaveBeenCalledWith(expect.stringContaining("Tidak bisa keluar"));
    expect(screen.getByRole("button", { name: "Keluar" })).toBeEnabled();
  });
});
