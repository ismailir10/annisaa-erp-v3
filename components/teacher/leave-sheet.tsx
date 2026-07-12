"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { ResponsiveFormDialog } from "@/components/ui/responsive-form-dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/empty-state";
import { Plus, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateShort } from "@/lib/format";

export type LeaveBalance = {
  annual: { total: number; used: number; remaining: number };
  sick: { total: number; used: number; remaining: number };
};

export type LeaveRequest = {
  id: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: string;
  reviewNote: string | null;
  createdAt: string;
};

const TYPE_LABELS: Record<string, string> = {
  ANNUAL: "Cuti Tahunan",
  SICK: "Sakit",
  PERMISSION: "Izin",
  OTHER: "Lainnya",
};
const SHEET_CLOSE_TRANSITION_MS = 240;

/** Count weekdays between two ISO date strings (inclusive). Matches API logic. */
function countWeekdays(start: string, end: string): number {
  if (!start || !end) return 0;
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  if (e < s) return 0;
  let count = 0;
  const d = new Date(s);
  while (d <= e) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

type LeaveSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Data prefetched by the parent page on mount. When provided and loaded, the sheet renders content instantly. */
  prefetchedBalance?: LeaveBalance | null;
  /** Requests prefetched by the parent page on mount. */
  prefetchedRequests?: LeaveRequest[] | null;
  /** True while the parent's prefetch is in-flight (shows skeleton until resolved). */
  prefetchLoading?: boolean;
  /** Callback to re-trigger the parent's prefetch after a mutation (submit / cancel). */
  onRefetch?: () => void;
};

export function LeaveSheet({
  open,
  onOpenChange,
  prefetchedBalance,
  prefetchedRequests,
  prefetchLoading = false,
  onRefetch,
}: LeaveSheetProps) {
  // Local state is used only when prefetch data is absent (cold open before prefetch resolves,
  // or fallback when the parent page didn't pass props).
  const hasPrefetch = prefetchedBalance !== undefined && prefetchedRequests !== undefined;

  const [localBalance, setLocalBalance] = useState<LeaveBalance | null>(null);
  const [localRequests, setLocalRequests] = useState<LeaveRequest[]>([]);
  const [localLoading, setLocalLoading] = useState(false);

  const balance = hasPrefetch ? prefetchedBalance : localBalance;
  const requests = hasPrefetch ? (prefetchedRequests ?? []) : localRequests;
  // Show skeleton while: prefetch in-flight OR (no prefetch + local fetch in-flight on open).
  const loading = hasPrefetch ? prefetchLoading : localLoading;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    leaveType: "ANNUAL",
    startDate: "",
    endDate: "",
    reason: "",
  });
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const pendingOverlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (pendingOverlayTimerRef.current) {
        clearTimeout(pendingOverlayTimerRef.current);
      }
    };
  }, []);

  async function fetchData() {
    setLocalLoading(true);
    try {
      const [balRes, reqRes] = await Promise.all([
        fetch("/api/leave/balance"),
        fetch("/api/leave/my"),
      ]);
      if (!balRes.ok || !reqRes.ok) {
        toast.error("Data cuti tidak bisa dimuat. Coba lagi sebentar ya.");
        setLocalLoading(false);
        return;
      }
      setLocalBalance(await balRes.json());
      setLocalRequests(await reqRes.json());
    } catch {
      toast.error("Data cuti tidak bisa dimuat. Coba lagi sebentar ya.");
    }
    setLocalLoading(false);
  }

  useEffect(() => {
    // Only run the local fetch when there is no prefetch wiring from the parent.
    if (!open || hasPrefetch) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hasPrefetch]);

  /** Refresh data after a mutation — uses parent refetch when wired, otherwise local fetch. */
  function refetchAfterMutation() {
    if (onRefetch) {
      onRefetch();
    } else {
      fetchData();
    }
  }

  async function handleSubmit() {
    if (!form.startDate || !form.endDate || !form.reason.trim()) {
      toast.error("Lengkapi tanggal dan alasan dulu ya.");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/leave/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      toast.success("Pengajuan cuti terkirim");
      setDialogOpen(false);
      setForm({ leaveType: "ANNUAL", startDate: "", endDate: "", reason: "" });
      refetchAfterMutation();
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error || "Pengajuan tidak terkirim. Coba lagi sebentar ya.");
    }
    setSaving(false);
  }

  async function handleCancel() {
    if (!cancelTarget) return;
    const res = await fetch(`/api/leave/requests/${cancelTarget}/cancel`, {
      method: "POST",
    });
    if (res.ok) {
      toast.success("Pengajuan dibatalkan");
      refetchAfterMutation();
      return;
    } else {
      toast.error("Pembatalan tidak tersimpan. Coba lagi ya.");
      throw new Error("leave cancel failed");
    }
  }

  const dayCount = countWeekdays(form.startDate, form.endDate);

  function openAfterSheetCloses(openNext: () => void) {
    if (pendingOverlayTimerRef.current) {
      clearTimeout(pendingOverlayTimerRef.current);
    }
    onOpenChange(false);
    pendingOverlayTimerRef.current = setTimeout(() => {
      pendingOverlayTimerRef.current = null;
      openNext();
    }, SHEET_CLOSE_TRANSITION_MS);
  }

  function openRequestForm() {
    openAfterSheetCloses(() => setDialogOpen(true));
  }

  function openCancelConfirm(id: string) {
    openAfterSheetCloses(() => setCancelTarget(id));
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="h-[85vh] max-w-md mx-auto rounded-t-2xl px-page-x pb-card pt-2 overflow-y-auto">
          <SheetHeader className="px-0 pt-2">
            <SheetTitle>Cuti &amp; Izin</SheetTitle>
            <SheetDescription>Kelola pengajuan cuti dan izin Anda</SheetDescription>
          </SheetHeader>

          {/* Balance cards */}
          {balance && (
            <div className="grid grid-cols-2 gap-3 mb-4">
              <Card className="p-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Cuti Tahunan</p>
                <p className="font-currency text-2xl font-bold mt-1 text-primary">
                  {balance.annual.remaining}
                </p>
                <p className="text-xs text-muted-foreground">dari {balance.annual.total} hari</p>
                <Progress
                  value={balance.annual.total > 0 ? (balance.annual.remaining / balance.annual.total) * 100 : 0}
                  className="mt-2 h-1.5"
                />
              </Card>
              <Card className="p-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Cuti Sakit</p>
                <p className="font-currency text-2xl font-bold mt-1 text-status-leave">
                  {balance.sick.remaining}
                </p>
                <p className="text-xs text-muted-foreground">dari {balance.sick.total} hari</p>
                <Progress
                  value={balance.sick.total > 0 ? (balance.sick.remaining / balance.sick.total) * 100 : 0}
                  className="mt-2 h-1.5 [&_[data-slot=progress-indicator]]:bg-status-leave"
                />
              </Card>
            </div>
          )}

          {/* Request button */}
          <Button size="sm" className="w-full mb-4" onClick={openRequestForm}>
            <Plus size={14} className="mr-1" /> Ajukan Cuti
          </Button>

          {/* Request list */}
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full rounded-xl" />
              ))}
            </div>
          ) : requests.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="Belum ada pengajuan cuti"
              description="Ketuk 'Ajukan Cuti' untuk membuat pengajuan baru."
              actionLabel="Ajukan Cuti"
              onAction={openRequestForm}
            />
          ) : (
            <div className="space-y-2">
              {requests.map((r) => (
                <Card key={r.id} className="p-3">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {TYPE_LABELS[r.leaveType] ?? r.leaveType}
                        </span>
                        <StatusBadge status={r.status} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDateShort(r.startDate)} — {formatDateShort(r.endDate)} ({r.days} hari)
                      </p>
                      <p className="text-xs mt-1">{r.reason}</p>
                      {r.reviewNote && (
                        <p className="text-xs text-muted-foreground mt-1 italic">
                          Admin: {r.reviewNote}
                        </p>
                      )}
                    </div>
                    {r.status === "PENDING" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive h-7 shrink-0"
                        onClick={() => openCancelConfirm(r.id)}
                      >
                        Batalkan
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}

        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={!!cancelTarget}
        onOpenChange={(o) => !o && setCancelTarget(null)}
        title="Batalkan Pengajuan"
        description="Yakin ingin membatalkan pengajuan cuti ini?"
        onConfirm={handleCancel}
        confirmLabel="Ya, Batalkan"
        destructive
      />

      <ResponsiveFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Ajukan Cuti"
        description="Pengajuan akan dikirim ke admin untuk persetujuan"
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={saving}>
              Batal
            </Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? "Mengirim..." : "Ajukan"}
            </Button>
          </>
        }
      >
        <Field>
          <FieldLabel>Jenis Cuti</FieldLabel>
          <Select
            value={form.leaveType}
            onValueChange={(v) => v && setForm({ ...form, leaveType: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ANNUAL">
                Cuti Tahunan ({balance?.annual.remaining ?? "?"} hari tersisa)
              </SelectItem>
              <SelectItem value="SICK">
                Sakit ({balance?.sick.remaining ?? "?"} hari tersisa)
              </SelectItem>
              <SelectItem value="PERMISSION">Izin</SelectItem>
              <SelectItem value="OTHER">Lainnya</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel>Tanggal Mulai</FieldLabel>
            <Input
              type="date"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel>Tanggal Selesai</FieldLabel>
            <Input
              type="date"
              value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
            />
          </Field>
        </div>
        {dayCount > 0 && (
          <p className="text-xs text-muted-foreground">
            {dayCount} hari kerja (tidak termasuk akhir pekan)
          </p>
        )}
        {form.startDate && form.endDate && dayCount === 0 && (
          <p className="text-xs text-destructive">
            Tanggal selesai harus sama atau setelah tanggal mulai
          </p>
        )}
        <Field>
          <FieldLabel>Alasan</FieldLabel>
          <Textarea
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
            placeholder="Jelaskan alasan cuti Anda..."
            rows={3}
          />
        </Field>
      </ResponsiveFormDialog>
    </>
  );
}
