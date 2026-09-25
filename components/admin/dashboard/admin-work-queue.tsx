"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { LegacyColumnDef } from "@tanstack/react-table/legacy";
import { ArrowRight, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { DataTableToolbar } from "@/components/ui/data-table-toolbar";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { AdminWorkItem, AdminWorkKind } from "@/lib/dashboard/admin-work-queue";

const ALL_KINDS: AdminWorkKind[] = ["enrollment", "leave", "invoice", "payroll"];
const kindLabels: Record<AdminWorkKind, string> = { enrollment: "Formulir pendaftaran", leave: "Pengajuan cuti", invoice: "Link pembayaran", payroll: "Draf penggajian" };
const stateLabels: Record<string, string> = { SUBMITTED: "Baru dikirim", UNDER_REVIEW: "Ditinjau", PENDING: "Menunggu", PENDING_PAYMENT_LINK: "Link belum tersedia", DRAFT: "Draf" };

export function DashboardRetry({ label = "Coba lagi" }: { label?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <Button variant="outline" onClick={() => startTransition(() => router.refresh())} disabled={pending} aria-busy={pending}><RefreshCw className="size-4" />{pending ? "Memuat ulang…" : label}</Button>;
}

export function AdminWorkQueue({ items, unavailable, initialKind, totalCount }: { items: AdminWorkItem[]; unavailable: AdminWorkKind[]; initialKind?: AdminWorkKind; totalCount?: number }) {
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<string>(initialKind ?? "all");
  const filtered = useMemo(() => items.filter(item => (kind === "all" || item.kind === kind) && `${item.title} ${item.description} ${item.recordId}`.toLocaleLowerCase("id").includes(search.toLocaleLowerCase("id"))), [items, search, kind]);
  const columns: LegacyColumnDef<AdminWorkItem>[] = [
    {
      accessorKey: "title",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Pekerjaan" />,
      cell: ({ row: { original: item } }) => <div className="min-w-40 max-w-xl whitespace-normal break-words space-y-1"><p className="font-semibold">{item.title}</p><p className="text-small text-muted-foreground">{item.description}</p><p className="text-small text-muted-foreground">{kindLabels[item.kind]}</p>{item.timeLabel && <p className="text-small">{item.timeLabel}</p>}<StatusBadge status={item.state} label={stateLabels[item.state]} /></div>,
    },
    {
      id: "actions", header: "Tindakan",
      cell: ({ row: { original: item } }) => <Link href={item.href} aria-label={`${item.actionLabel}: ${item.title}`} className={buttonVariants({ variant: "outline", className: "h-auto min-h-11 max-w-36 whitespace-normal text-left" })}>{item.actionLabel}<ArrowRight className="size-4" /></Link>,
    },
  ];
  return <Card className="min-w-0 gap-4" data-testid="admin-work-queue">
    <CardHeader className="gap-2">
      <CardTitle>Antrean pekerjaan</CardTitle>
      <CardDescription>{unavailable.length ? `${items.length} pekerjaan dari sumber yang berhasil dimuat; sebagian sumber belum tersedia.` : totalCount !== undefined && totalCount > items.length ? `Menampilkan ${items.length} dari ${totalCount} pekerjaan terbuka; selesaikan yang terlama lebih dulu.` : `${items.length} pekerjaan terbuka yang dapat Anda tangani.`}</CardDescription>
    </CardHeader>
    <CardContent className="min-w-0 space-y-field">
      {unavailable.map(k => <Alert key={k}><AlertTitle>{kindLabels[k]} belum dapat dimuat</AlertTitle><AlertDescription><p>Jumlah pekerjaan dari sumber ini belum diketahui.</p><DashboardRetry label={`Muat ulang ${kindLabels[k].toLowerCase()}`} /></AlertDescription></Alert>)}
      <DataTableToolbar value={search} onValueChange={setSearch} searchPlaceholder="Cari pekerjaan, nama, atau nomor…" filters={[{ key: "kind", label: "jenis", value: kind, onChange: setKind, options: [{ value: "all", label: "Semua jenis" }, ...ALL_KINDS.filter(k => items.some(i => i.kind === k) || k === kind).map(k => ({ value: k, label: kindLabels[k] }))] }]} />
      {(items.length > 0 || unavailable.length === 0) && <DataTable columns={columns} data={filtered} pagination={{ page: 1, pageSize: 10, total: filtered.length, totalPages: Math.ceil(filtered.length / 10) }} emptyTitle={search || kind !== "all" ? "Tidak ada pekerjaan yang cocok" : "Tidak ada pekerjaan yang menunggu"} emptyDescription={search || kind !== "all" ? "Atur ulang pencarian dan jenis untuk melihat pekerjaan lain." : "Formulir, cuti, link pembayaran, dan draf penggajian akan muncul sesuai akses Anda."} />}
    </CardContent>
  </Card>;
}
