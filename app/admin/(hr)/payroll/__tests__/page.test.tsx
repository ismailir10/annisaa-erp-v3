import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/components/admin/page-header", () => ({ PageHeader: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock("@/components/ui/data-table", () => ({ DataTable: () => <div data-testid="payroll-table" /> }));
vi.mock("@/components/ui/data-table-toolbar", () => ({ DataTableToolbar: () => null }));
vi.mock("@/components/admin/stats-cards-row", () => ({ StatsCardsRow: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/admin/stat-card", () => ({ StatCard: ({ label, value }: { label: string; value: string | number }) => <p>{label}: {value}</p> }));

import PayrollListPage from "../page";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("payroll summary states", () => {
  it("shows unavailable on failed stats and recovers after retry", async () => {
    let statsRequests = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      if (input === "/api/payroll/stats") {
        statsRequests++;
        return statsRequests === 1
          ? { ok: false }
          : { ok: true, json: async () => ({ total: 0, draft: 0, approved: 0, slipsSent: 0 }) };
      }
      return { ok: true, json: async () => ({ data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } }) };
    }));

    render(<PayrollListPage />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Ringkasan penggajian tidak bisa dimuat."));
    expect(screen.getByText("Total Penggajian: —")).toBeInTheDocument();
    expect(screen.queryByText("Total Penggajian: 0")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Coba lagi" }));
    await waitFor(() => expect(screen.getByText("Total Penggajian: 0")).toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
