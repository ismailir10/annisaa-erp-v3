/**
 * Admin UI audit fixes (T8, finding #12) — the enrollment detail page used
 * to hand-roll its loading/not-found states as plain `<p>` text instead of
 * the shared `DetailPageSkeleton` / `EmptyState` primitives every sibling
 * detail page (students, guardians) already uses. This guards the
 * not-found branch: against the pre-fix markup
 * (`<p className="p-6 …">Formulir tidak ditemukan.</p>`) there is no
 * `EmptyState` title/description pairing and no way back to the list, so
 * these assertions would fail.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import EnrollmentDetailPage from "../page";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

/**
 * `use(params)` suspends on first render for a "cold" Promise — React only
 * reads a `use()`-d thenable synchronously once it carries a `status`/`value`
 * pair, which it normally attaches itself via `.then()` on a later tick. jsdom
 * + this repo's vitest/RTL combo never flushes that retry tick (verified with
 * a minimal repro: even 3s of real-timer `waitFor` never resolves it), so a
 * genuinely-pending `Promise.resolve(...)` never renders past the Suspense
 * fallback here. Pre-attach the fulfilled marker React itself would set once
 * the promise settles, so `use()` returns synchronously on first render — this
 * mirrors real behaviour (Next.js pre-resolves route params before paint) and
 * lets the test exercise the page's actual not-found branch instead of a
 * permanently-suspended tree.
 */
function fulfilledParams(value: { id: string }): Promise<{ id: string }> {
  const p = Promise.resolve(value) as Promise<{ id: string }> & {
    status?: string;
    value?: { id: string };
  };
  p.status = "fulfilled";
  p.value = value;
  return p;
}

describe("EnrollmentDetailPage — not-found state (AC12)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          json: async () => ({ error: "Not found" }),
        } as Response),
      ),
    );
  });

  it("renders the shared EmptyState with a description and a way back to the list", async () => {
    render(
      <EnrollmentDetailPage params={fulfilledParams({ id: "missing-id" })} />,
    );

    expect(
      await screen.findByText("Formulir tidak ditemukan"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Formulir pendaftaran ini tidak tersedia atau telah dihapus.",
      ),
    ).toBeInTheDocument();

    const backLink = screen.getByRole("link", {
      name: "Kembali ke Daftar Formulir Pendaftaran",
    });
    expect(backLink).toHaveAttribute("href", "/admin/enrollments");
  });
});
