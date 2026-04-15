"use client";

import { useEffect, useState } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Plus, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateShort } from "@/lib/format";

type LeaveBalance = {
  annual: { total: number; used: number; remaining: number };
  sick: { total: number; used: number; remaining: number };
};

type LeaveRequest = {
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

export function LeaveSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [balance, setBalance] = useState<LeaveBalance | null>(null);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    leaveType: "ANNUAL",
    startDate: "",
    endDate: "",
    reason: "",
  });
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    fetchData();
  }, [open]);

  async function fetchData() {
    setLoading(true);
    try {
      const [balRes, reqRes] = await Promise.all([
        fetch("/api/leave/balance"),
        fetch("/api/leave/my"),
      ]);
      if (!balRes.ok || !reqRes.ok) {
        toast.error("Gagal memuat data cuti");
        setLoading(false);
        return;
      }
      setBalance(await balRes.json());
      setRequests(await reqRes.json());
    } catch {
      toast.error("Gagal memuat data cuti");
    }
    setLoading(false);
  }

  async function handleSubmit() {
    if (!form.startDate || !form.endDate || !form.reason.trim()) {
      toast.error("Mohon lengkapi tanggal dan alasan");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/leave/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      toast.success("Pengajuan cuti berhasil dikirim");
      setDialogOpen(false);
      setForm({ leaveType: "ANNUAL", startDate: "", endDate: "", reason: "" });
      fetchData();
    } else {
      const d = await res.json();
      toast.error(d.error || "Gagal mengajukan cuti");
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
      fetchData();
    } else {
      toast.error("Gagal membatalkan");
    }
    setCancelTarget(null);
  }

  const dayCount = countWeekdays(form.startDate, form.endDate);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="h-[85vh] max-w-md mx-auto rounded-t-2xl px-5 pb-6 pt-2 overflow-y-auto">
          <SheetHeader className="px-0 pt-2">
            <SheetTitle>Cuti &amp; Izin</SheetTitle>
            <SheetDescription>Kelola pengajuan cuti dan izin Anda</SheetDescription>
          </SheetHeader>

          {/* Balance cards */}
          {balance && (
            <div className="grid grid-cols-2 gap-3 mb-4">
              <Card className="p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Cuti Tahunan</p>
                <p className="font-currency text-2xl font-bold mt-1 text-primary">
                  {balance.annual.remaining}
                </p>
                <p className="text-[10px] text-muted-foreground">dari {balance.annual.total} hari</p>
                <div className="w-full h-1.5 bg-muted rounded-full mt-2">
                  <div
                    className="h-full bg-primary rounded-full"
                    style={{ width: `${(balance.annual.remaining / balance.annual.total) * 100}%` }}
                  />
                </div>
              </Card>
              <Card className="p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Cuti Sakit</p>
                <p className="font-currency text-2xl font-bold mt-1 text-status-leave">
                  {balance.sick.remaining}
                </p>
                <p className="text-[10px] text-muted-foreground">dari {balance.sick.total} hari</p>
                <div className="w-full h-1.5 bg-muted rounded-full mt-2">
                  <div
                    className="h-full bg-status-leave rounded-full"
                    style={{ width: `${(balance.sick.remaining / balance.sick.total) * 100}%` }}
                  />
                </div>
              </Card>
            </div>
          )}

          {/* Request button */}
          <Button size="sm" className="w-full mb-4" onClick={() => setDialogOpen(true)}>
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
              onAction={() => setDialogOpen(true)}
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
                        onClick={() => setCancelTarget(r.id)}
                      >
                        Batalkan
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Cancel confirmation */}
          <ConfirmDialog
            open={!!cancelTarget}
            onOpenChange={(o) => !o && setCancelTarget(null)}
            title="Batalkan Pengajuan"
            description="Yakin ingin membatalkan pengajuan cuti ini?"
            onConfirm={handleCancel}
            confirmLabel="Ya, Batalkan"
            destructive
          />
        </SheetContent>
      </Sheet>

      {/* Submit dialog — renders on top of Sheet */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajukan Cuti</DialogTitle>
            <DialogDescription>
              Pengajuan akan dikirim ke admin untuk persetujuan
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
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
          </div>
          <DialogFooter>
            <DialogClose>
              <Button variant="outline">Batal</Button>
            </DialogClose>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? "Mengirim..." : "Ajukan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
