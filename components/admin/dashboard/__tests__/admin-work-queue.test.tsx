import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { AdminWorkQueue } from "../admin-work-queue";
const items = [
  { id: "invoice:i1", kind: "invoice" as const, title: "Pulihkan link Alya", description: "INV-001 · September", recordId: "INV-001", state: "PENDING_PAYMENT_LINK", actionLabel: "Buka tagihan", href: "/admin/invoices/i1", dueDate: "2026-09-30", timeLabel: "Jatuh tempo 30 Sep 2026" },
  { id: "leave:l1", kind: "leave" as const, title: "Putuskan izin Rina", description: "Izin tahunan", recordId: "l1", state: "PENDING", actionLabel: "Tinjau izin", href: "/admin/leave-requests?requestId=l1" },
];
describe("admin work queue", () => {
  it("searches real record identity and keeps direct action destinations", () => {
    render(<AdminWorkQueue items={items} unavailable={[]} />);
    expect(screen.getByRole("link", { name: "Buka tagihan: Pulihkan link Alya" })).toHaveAttribute("href", "/admin/invoices/i1");
    fireEvent.change(screen.getByRole("textbox", { name: "Cari pekerjaan, nama, atau nomor…" }), { target: { value: "INV-001" } });
    expect(screen.getByText("Pulihkan link Alya")).toBeVisible();
    expect(screen.queryByText("Putuskan izin Rina")).not.toBeInTheDocument();
    expect(screen.getByText("Jatuh tempo 30 Sep 2026")).toBeVisible();
  });
  it("offers retry for each failed source without claiming that no work exists", () => {
    render(<AdminWorkQueue items={[]} unavailable={["enrollment", "payroll"]} />);
    expect(screen.getByRole("button", { name: "Muat ulang formulir pendaftaran" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Muat ulang draf penggajian" })).toBeVisible();
    expect(screen.queryByText("Tidak ada pekerjaan yang menunggu")).not.toBeInTheDocument();
  });

  it("filters by kind (leave and payroll stay distinct, unlike the old shared SDM domain)", () => {
    const payrollItem = { id: "payroll:p1", kind: "payroll" as const, title: "Tinjau draf penggajian", description: "September", recordId: "p1", state: "DRAFT", actionLabel: "Tinjau draf", href: "/admin/payroll/p1" };
    render(<AdminWorkQueue items={[...items, payrollItem]} unavailable={[]} />);
    expect(screen.getByText("Putuskan izin Rina")).toBeVisible();
    expect(screen.getByText("Tinjau draf penggajian")).toBeVisible();
  });

  it("preselects the filter from initialKind, scoping the table to that kind on load", () => {
    const payrollItem = { id: "payroll:p1", kind: "payroll" as const, title: "Tinjau draf penggajian", description: "September", recordId: "p1", state: "DRAFT", actionLabel: "Tinjau draf", href: "/admin/payroll/p1" };
    render(<AdminWorkQueue items={[...items, payrollItem]} unavailable={[]} initialKind="payroll" />);
    expect(screen.getByText("Tinjau draf penggajian")).toBeVisible();
    expect(screen.queryByText("Putuskan izin Rina")).not.toBeInTheDocument();
  });

  it("shows the true total when the loaded page is capped below it", () => {
    render(<AdminWorkQueue items={items} unavailable={[]} totalCount={250} />);
    expect(screen.getByText("Menampilkan 2 dari 250 pekerjaan terbuka; selesaikan yang terlama lebih dulu.")).toBeVisible();
  });

  it("keeps the plain count copy when totalCount matches the loaded items", () => {
    render(<AdminWorkQueue items={items} unavailable={[]} totalCount={items.length} />);
    expect(screen.getByText("2 pekerjaan terbuka yang dapat Anda tangani.")).toBeVisible();
  });
});
