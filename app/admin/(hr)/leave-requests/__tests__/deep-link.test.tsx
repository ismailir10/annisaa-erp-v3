import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
const navigation = vi.hoisted(() => ({ replace: vi.fn(), search: "requestId=target" }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(navigation.search), useRouter: () => ({ replace: navigation.replace }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
import AdminLeavePage from "../page";
const record = { id: "target", leaveType: "SICK", startDate: "2026-09-25", endDate: "2026-09-26", days: 2, reason: "Istirahat", status: "APPROVED", reviewNote: null, createdAt: "2026-09-24", employee: { nama: "Alya", kode: "E001", jabatan: "Guru", campus: { name: "Kampus A" } } };
function fixture(found = true, approve = true) {
  const fetcher = vi.fn(async (input: string) => {
    if (input.includes("/stats")) return { ok: true, json: async () => ({ total: 0, pending: 0, approved: 0, rejected: 0 }) };
    const selected = input.includes("requestId=");
    return { ok: true, json: async () => ({ data: selected && found ? [record] : [], pagination: { page: 1, pageSize: 20, total: selected && found ? 1 : 0, totalPages: 1 }, capabilities: { approve } }) };
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
beforeEach(() => { vi.clearAllMocks(); navigation.search = "requestId=target"; });
describe("leave record deep link", () => {
  it("opens an approved record independently from the pending table and stays closed after dismiss", async () => {
    const fetcher = fixture();
    render(<AdminLeavePage />);
    expect(await screen.findByRole("dialog", { name: "Detail Cuti" })).toBeVisible();
    expect(fetcher.mock.calls.some(([url]) => url.includes("requestId=target") && !url.includes("status="))).toBe(true);
    fireEvent.click(screen.getAllByRole("button", { name: "Tutup" })[0]);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(navigation.replace).toHaveBeenCalledWith("/admin/leave-requests", { scroll: false });
    expect(fetcher.mock.calls.filter(([url]) => url.includes("/requests?") && !url.includes("requestId")).length).toBeGreaterThan(0);
  });
  it("reports a missing or foreign record without showing another request", async () => {
    fixture(false);
    render(<AdminLeavePage />);
    expect(await screen.findByText("Pengajuan tidak tersedia")).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Lihat daftar pengajuan" }));
    await waitFor(() => expect(screen.queryByText("Pengajuan tidak tersedia")).not.toBeInTheDocument());
  });
  it("opens pending records read-only without approval capability", async () => {
    const original = record.status;
    record.status = "PENDING";
    fixture(true, false);
    render(<AdminLeavePage />);
    expect(await screen.findByRole("dialog", { name: "Detail Cuti" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Setujui" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tolak" })).not.toBeInTheDocument();
    record.status = original;
  });
});
