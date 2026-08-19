import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import Page from "../page";

const ok = (data: unknown) => ({ ok: true, json: async () => data });
const failed = { ok: false, json: async () => ({}) };

afterEach(() => vi.unstubAllGlobals());

describe("teacher slips recovery", () => {
  it("keeps a rejected request distinct from the empty state and retries successfully", async () => {
    let resolveRetry: (value: unknown) => void = () => {};
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(() => ++calls === 1
      ? Promise.reject(new Error("offline"))
      : new Promise((resolve) => { resolveRetry = resolve; })));
    render(<Page />);

    await screen.findByText("Slip gaji tidak bisa dimuat");
    expect(screen.queryByText("Belum ada riwayat slip sebelumnya.")).toBeNull();
    const retry = screen.getByRole("button", { name: "Coba lagi" });
    expect(retry).toHaveClass("tap-target");

    fireEvent.click(retry);
    expect(document.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(3);
    await act(async () => resolveRetry(ok([])));
    await screen.findByText("Belum ada riwayat slip sebelumnya.");
    expect(screen.queryByText("Slip gaji tidak bisa dimuat")).toBeNull();
  });

  it("renders a local recovery state for a non-OK response", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(failed)));
    render(<Page />);

    await screen.findByText("Slip gaji tidak bisa dimuat");
    expect(screen.getByRole("button", { name: "Coba lagi" })).toBeInTheDocument();
    expect(screen.queryByText("Belum ada riwayat slip sebelumnya.")).toBeNull();
  });

  it("renders the legitimate empty state only after a successful response", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(ok([]))));
    render(<Page />);

    await screen.findByText("Belum ada riwayat slip sebelumnya.");
    expect(screen.queryByText("Slip gaji tidak bisa dimuat")).toBeNull();
  });
});
