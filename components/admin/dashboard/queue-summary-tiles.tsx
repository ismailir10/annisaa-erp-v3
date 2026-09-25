import Link from "next/link";
import { DashboardRetry } from "@/components/admin/dashboard/admin-work-queue";
import type { QueueSummaryItem } from "@/lib/dashboard/admin-work-queue";

const tileLabel: Record<QueueSummaryItem["kind"], string> = {
  enrollment: "Formulir menunggu tinjauan",
  leave: "Pengajuan cuti menunggu",
  invoice: "Link pembayaran belum tersedia",
  payroll: "Draf penggajian",
};

/**
 * One compact tile per visible work-queue source, linking straight into the
 * filtered `/admin/work-queue` table. Replaces the old full DataTable on the
 * dashboard itself so the page fits one screen — the table lives at
 * `/admin/work-queue` now.
 */
export function QueueSummaryTiles({ items }: { items: QueueSummaryItem[] }) {
  if (items.length === 0) return null;

  const total = items.reduce((sum, item) => sum + item.count, 0);
  const allReady = items.every((item) => item.status === "ready");

  if (allReady && total === 0) {
    return (
      <p data-testid="dashboard-queue-tiles" className="text-body text-muted-foreground">
        Semua beres — tidak ada pekerjaan yang menunggu.
      </p>
    );
  }

  return (
    <div data-testid="dashboard-queue-tiles" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((item) =>
        item.status === "unavailable" ? (
          <div key={item.kind} className="space-y-2 rounded-lg border p-card">
            <p className="font-currency text-display font-bold tabular-nums text-muted-foreground">—</p>
            <p className="text-small text-muted-foreground">{tileLabel[item.kind]}</p>
            <p className="text-small text-muted-foreground">Belum dapat dimuat.</p>
            <DashboardRetry label="Coba lagi" />
          </div>
        ) : (
          <Link
            key={item.kind}
            href={`/admin/work-queue?kind=${item.kind}`}
            aria-label={`${item.count} ${tileLabel[item.kind]}`}
            className="block rounded-lg border p-card outline-none transition-shadow hover:shadow-sm hover:ring-1 hover:ring-primary/30 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <p className="font-currency text-display font-bold tabular-nums">{item.count}</p>
            <p className="mt-1 text-small text-muted-foreground">{tileLabel[item.kind]}</p>
          </Link>
        ),
      )}
    </div>
  );
}
