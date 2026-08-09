/**
 * Admin UI audit fixes (T7, finding #5) — the note-delete confirmation on
 * this page called a soft delete (`app/api/student-journal/admin/notes/[id]/
 * route.ts` sets `status: "INACTIVE"`, never a hard delete) but the dialog's
 * title and confirm button said "Hapus" / "Ya, Hapus". Per voice.md's
 * destructive-confirmation table, soft delete must say "Nonaktifkan", never
 * "Hapus" — the dialog's own body copy already said "dinonaktifkan", so the
 * title/button contradicted the body. This test renders the real page,
 * opens the Catatan tab, triggers the delete confirm, and asserts the fixed
 * copy. Against the pre-fix markup, `getByText("Nonaktifkan catatan?")`
 * and `getByRole("button", { name: "Ya, Nonaktifkan" })` would both throw.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import StudentJournalDetailPage from "../page";

/**
 * `use(params)` suspends on first render for a "cold" Promise — React only
 * reads a `use()`-d thenable synchronously once it carries a `status`/`value`
 * pair, which it normally attaches itself on a later tick. jsdom + this repo's
 * vitest/RTL combo never flushes that retry tick, so a plain
 * `Promise.resolve(...)` leaves the tree permanently suspended. Pre-attach the
 * fulfilled marker React itself would set, mirroring real behaviour (Next.js
 * pre-resolves route params before paint). Same workaround as
 * `app/admin/enrollments/[id]/__tests__/page.test.tsx`.
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

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

const WEEK_PAYLOAD = {
  data: {
    weekStart: "2026-08-03",
    dates: [
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
      "2026-08-06",
      "2026-08-07",
    ],
    schoolCategories: [],
    homeCategories: [],
    schoolEntries: [],
    homeEntries: [],
    notes: [
      {
        id: "note-1",
        date: "2026-08-05",
        authorRole: "TEACHER",
        authorName: "Ustadzah Sari",
        body: "Ananda semangat belajar hari ini.",
        createdAt: "2026-08-05T03:00:00.000Z",
      },
    ],
  },
};

function stubFetch() {
  return vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/week?weekStart=")) {
      return Promise.resolve({
        ok: true,
        json: async () => WEEK_PAYLOAD,
      } as Response);
    }
    if (url.includes("/api/students/")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ data: { name: "Aisyah Nuraini" } }),
      } as Response);
    }
    return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
  });
}

describe("StudentJournalDetailPage — note delete confirm copy (AC5)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", stubFetch());
  });

  it("labels the soft-delete confirmation 'Nonaktifkan', never 'Hapus'", async () => {
    const user = userEvent.setup();
    render(
      <StudentJournalDetailPage params={fulfilledParams({ id: "student-1" })} />,
    );

    await user.click(await screen.findByRole("tab", { name: "Catatan" }));
    await user.click(await screen.findByRole("button", { name: "Hapus catatan" }));

    expect(await screen.findByText("Nonaktifkan catatan?")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Ya, Nonaktifkan" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Hapus catatan?")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Ya, Hapus" }),
    ).not.toBeInTheDocument();
  });
});
