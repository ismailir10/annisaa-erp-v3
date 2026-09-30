import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { signOut } from "@/lib/sign-out";

/**
 * PAR-1: sign-out must end in a full document navigation, never a client-side
 * router.push — otherwise Back restores the signed-in page from the Next
 * router cache.
 */
const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("signOut", () => {
  it("POSTs the logout endpoint, then navigates to the landing page after it resolves", async () => {
    const order: string[] = [];
    fetchMock.mockImplementation(async () => {
      order.push("fetch");
      return { ok: true };
    });
    const navigate = vi.fn(() => order.push("navigate"));

    await signOut("/", navigate);

    expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", { method: "POST", cache: "no-store" });
    expect(navigate).toHaveBeenCalledWith("/");
    expect(order).toEqual(["fetch", "navigate"]);
  });

  it("does not navigate, and throws, when the server refuses to end the session", async () => {
    fetchMock.mockResolvedValue({ ok: false });
    const navigate = vi.fn();
    await expect(signOut("/", navigate)).rejects.toThrow();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("default navigation uses window.location.replace (full document load, replaces the history entry)", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    // jsdom cannot navigate; it logs "not implemented" and leaves the URL alone.
    // Assert the source contract instead: no router import in the helper.
    const src = await import("node:fs").then((fs) => fs.readFileSync("lib/sign-out.ts", "utf8"));
    expect(src).toContain("window.location.replace");
    expect(src).not.toContain("next/navigation");
  });
});
