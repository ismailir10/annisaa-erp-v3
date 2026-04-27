import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PendingLinkBreakdownPopover } from "../pending-link-breakdown-popover";

// All 10 buckets must be present on the wire shape — the API zero-fills them.
type ByPrefix = {
  "5xx": number;
  "429": number;
  "408": number;
  network: number;
  "401": number;
  "403": number;
  "422": number;
  "4xx": number;
  untagged: number;
  unknown: number;
};

function makeByPrefix(overrides: Partial<ByPrefix> = {}): ByPrefix {
  return {
    "5xx": 0,
    "429": 0,
    "408": 0,
    network: 0,
    "401": 0,
    "403": 0,
    "422": 0,
    "4xx": 0,
    untagged: 0,
    unknown: 0,
    ...overrides,
  };
}

function mockBreakdown(total: number, byPrefix: ByPrefix) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ total, byPrefix }),
  } as unknown as Response);
}

describe("PendingLinkBreakdownPopover", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders the trigger button with the count", () => {
    render(
      <PendingLinkBreakdownPopover
        count={5}
        retrying={false}
        onClickRetry={() => {}}
      />,
    );

    expect(
      screen.getByRole("button", { name: /Coba Lagi Link \(5\)/ }),
    ).toBeInTheDocument();
  });

  it("does not fetch on initial render — only on first open", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PendingLinkBreakdownPopover
        count={3}
        retrying={false}
        onClickRetry={() => {}}
      />,
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches and renders non-zero buckets when opened", async () => {
    const fetchMock = mockBreakdown(
      6,
      makeByPrefix({ "5xx": 4, "401": 2 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(
      <PendingLinkBreakdownPopover
        count={6}
        retrying={false}
        onClickRetry={() => {}}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Coba Lagi Link/ }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/invoices/pending-payment-link/breakdown",
      );
    });

    expect(await screen.findByText("Rincian gagal")).toBeInTheDocument();
    // Both non-zero buckets are present.
    expect(screen.getByText("5xx")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("401")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    // Zero buckets are filtered out.
    expect(screen.queryByText("429")).not.toBeInTheDocument();
    expect(screen.queryByText("422")).not.toBeInTheDocument();
  });

  it("shows the empty-state hint when total is zero", async () => {
    const fetchMock = mockBreakdown(0, makeByPrefix());
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(
      <PendingLinkBreakdownPopover
        count={0}
        retrying={false}
        onClickRetry={() => {}}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Coba Lagi Link/ }));

    expect(
      await screen.findByText(/Belum ada rincian — coba lagi setelah retry/),
    ).toBeInTheDocument();
  });

  it("renders the auth-heavy warning when (401 + 403) / total > 0.5", async () => {
    // 4 / 6 = 0.66 — exceeds threshold.
    const fetchMock = mockBreakdown(
      6,
      makeByPrefix({ "401": 3, "403": 1, "5xx": 2 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(
      <PendingLinkBreakdownPopover
        count={6}
        retrying={false}
        onClickRetry={() => {}}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Coba Lagi Link/ }));

    expect(
      await screen.findByText(/Banyak gagal autentikasi/),
    ).toBeInTheDocument();
    expect(screen.getByText("XENDIT_SECRET_KEY")).toBeInTheDocument();
  });

  it("does NOT render the auth-heavy warning when auth share is at or below threshold", async () => {
    // 1 / 4 = 0.25 — below threshold.
    const fetchMock = mockBreakdown(
      4,
      makeByPrefix({ "401": 1, "5xx": 3 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(
      <PendingLinkBreakdownPopover
        count={4}
        retrying={false}
        onClickRetry={() => {}}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Coba Lagi Link/ }));

    await screen.findByText("Rincian gagal");
    expect(
      screen.queryByText(/Banyak gagal autentikasi/),
    ).not.toBeInTheDocument();
  });

  it("fires onClickRetry when 'Coba Lagi Sekarang' is clicked", async () => {
    const fetchMock = mockBreakdown(
      2,
      makeByPrefix({ "5xx": 2 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const onClickRetry = vi.fn();
    const user = userEvent.setup();
    render(
      <PendingLinkBreakdownPopover
        count={2}
        retrying={false}
        onClickRetry={onClickRetry}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Coba Lagi Link/ }));
    await screen.findByText("Rincian gagal");

    await user.click(
      screen.getByRole("button", { name: /Coba Lagi Sekarang/ }),
    );

    expect(onClickRetry).toHaveBeenCalledTimes(1);
  });

  it("shows the trigger as 'Mencoba...' when retrying is true", () => {
    render(
      <PendingLinkBreakdownPopover
        count={3}
        retrying={true}
        onClickRetry={() => {}}
      />,
    );

    expect(
      screen.getByRole("button", { name: /Mencoba\.\.\./ }),
    ).toBeInTheDocument();
  });

  it("only fetches once even after closing and re-opening", async () => {
    const fetchMock = mockBreakdown(
      2,
      makeByPrefix({ "5xx": 2 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(
      <PendingLinkBreakdownPopover
        count={2}
        retrying={false}
        onClickRetry={() => {}}
      />,
    );

    const trigger = screen.getByRole("button", { name: /Coba Lagi Link/ });
    await user.click(trigger);
    await screen.findByText("Rincian gagal");
    // Close
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByText("Rincian gagal")).not.toBeInTheDocument();
    });
    // Re-open
    await user.click(trigger);
    await screen.findByText("Rincian gagal");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
