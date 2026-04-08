"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { toast } from "sonner";

const STATUSES = [
  { value: "PRESENT", label: "Hadir" },
  { value: "LATE", label: "Terlambat" },
  { value: "ABSENT", label: "Tidak Hadir" },
  { value: "LEAVE", label: "Izin/Cuti" },
  { value: "HALF_DAY", label: "Setengah Hari" },
];

export function OverrideModal({
  open,
  onOpenChange,
  recordId,
  employeeId,
  employeeName,
  date,
  currentStatus,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recordId: string | null;
  employeeId: string;
  employeeName: string;
  date: string;
  currentStatus: string | null;
  onSuccess: () => void;
}) {
  const [status, setStatus] = useState(currentStatus ?? "PRESENT");
  const [reason, setReason] = useState("");
  const [checkInTime, setCheckInTime] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!reason.trim()) { toast.error("Alasan wajib diisi"); return; }
    setSaving(true);

    if (recordId) {
      // Update existing record
      const res = await fetch(`/api/attendance/${recordId}/override`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, reason, checkInTime: checkInTime || undefined }),
      });
      if (res.ok) {
        toast.success("Kehadiran diperbarui");
        onOpenChange(false);
        onSuccess();
      } else {
        const data = await res.json();
        toast.error(data.error || "Gagal menyimpan");
      }
    } else {
      // Create new record for employee on this date
      const res = await fetch(`/api/attendance/${employeeId}/override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, status, reason }),
      });
      if (res.ok) {
        toast.success("Kehadiran ditambahkan");
        onOpenChange(false);
        onSuccess();
      } else {
        const data = await res.json();
        toast.error(data.error || "Gagal menyimpan");
      }
    }
    setSaving(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Override Kehadiran</DialogTitle>
          <DialogDescription>
            {employeeName} — {new Date(date + "T00:00:00").toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Status *</Label>
            <Select value={status} onValueChange={(v) => v && setStatus(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {(status === "PRESENT" || status === "LATE") && (
            <div>
              <Label>Waktu Masuk</Label>
              <Input type="time" value={checkInTime} onChange={(e) => setCheckInTime(e.target.value)} />
            </div>
          )}
          <div>
            <Label>Alasan *</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Contoh: Sakit, konfirmasi via WA"
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose><Button variant="outline">Batal</Button></DialogClose>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Menyimpan..." : "Simpan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
