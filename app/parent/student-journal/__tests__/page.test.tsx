import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// T1 — the render gate in ../page.tsx must key off `schoolCategories` /
// `homeCategories` (whether the tenant template has ACTIVE categories),
// NOT off `schoolEntries` / `homeEntries` / `notes`. A week with zero
// entries and zero notes must still render the tabs (incl. the editable
// "Di Rumah" grid) as long as the template has at least one category —
// otherwise a wali can never make the first tick.

const nav = vi.hoisted(() => ({
  replace: vi.fn(),
  params: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
  usePathname: () => "/parent/student-journal",
  useSearchParams: () => nav.params,
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import ParentStudentJournalPage from "../page";

const children = [
  { id: "child_1", name: "Aisyah Nuraini", nickname: "Aisyah", className: "TKA" },
];

const baseWeekData = {
  weekStart: "2026-08-10",
  dates: ["2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14"],
  schoolCategories: [] as unknown[],
  homeCategories: [] as unknown[],
  schoolEntries: [] as unknown[],
  homeEntries: [] as unknown[],
  notes: [] as unknown[],
};

const homeCategories = [
  {
    id: "cat_home_1",
    name: "Ibadah",
    scope: "HOME",
    indicators: [
      { id: "ind_1", label: "Shalat Subuh", order: 1 },
      { id: "ind_2", label: "Mengaji", order: 2 },
    ],
  },
];

function mockFetchWith(weekData: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url === "/api/auth/me") {
        return Promise.resolve({ ok: true, json: async () => ({ id: "user_1" }) });
      }
      if (url === "/api/parent/children") {
        return Promise.resolve({ ok: true, json: async () => ({ data: children }) });
      }
      if (url.startsWith("/api/student-journal/children/")) {
        return Promise.resolve({ ok: true, json: async () => ({ data: weekData }) });
      }
      return Promise.reject(new Error(`Unhandled fetch: ${url}`));
    }),
  );
}

describe("ParentStudentJournalPage", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    nav.replace.mockClear();
    nav.params = new URLSearchParams();
  });

  it("shows the EmptyState only when both schoolCategories and homeCategories are empty", async () => {
    mockFetchWith(baseWeekData);
    render(<ParentStudentJournalPage />);

    await screen.findByText("Jurnal belum diatur sekolah");
    expect(
      screen.getByText(
        "Sekolah belum menambahkan indikator harian untuk Jurnal. Hubungi admin sekolah untuk informasi lebih lanjut.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Di rumah" })).not.toBeInTheDocument();
  });

  it("renders the Di Rumah tab and its indicators when homeCategories is non-empty, even with zero entries and notes", async () => {
    nav.params = new URLSearchParams("view=home");
    mockFetchWith({ ...baseWeekData, homeCategories });
    render(<ParentStudentJournalPage />);

    // Tabs render instead of the EmptyState.
    await screen.findByRole("tab", { name: "Di rumah" });
    expect(screen.queryByText("Jurnal belum diatur sekolah")).not.toBeInTheDocument();

    // The "Di Rumah" panel (active via ?view=home) shows the template's
    // indicators even though schoolEntries/homeEntries/notes are all [].
    expect(await screen.findByText("Shalat Subuh")).toBeInTheDocument();
    expect(screen.getByText("Mengaji")).toBeInTheDocument();
  });
});
