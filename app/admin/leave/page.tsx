"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

type LeaveRequest = {
  id: string; leaveType: string; startDate: string; endDate: string;
  days: number; reason: string; status: string; reviewNote: string | null; createdAt: string;
  employee: { nama: string; kode: string; jabatan: string; campus: { name: string } };
};

const TYPE_LABELS: Record<string, string> = { ANNUAL: "Cuti Tahunan", SICK: "Sakit", PERMISSION: "Izin", OTHER: "Lainnya" };
const STATUS_MAP: Record<string, { label: string; class: string }> = {
  PENDING: { label: "Menunggu", class: "bg-status-late-subtle text-[#B35C00]" },
  APPROVED: { label: "Disetujui", class: "bg-status-present-subtle text-[#00875A]" },
  REJECTED: { label: "Ditolak", class: "bg-status-absent-subtle text-[#CC0000]" },
  CANCELLED: { label: "Dibatalkan", class: "bg-muted text-muted-foreground" },
};

export default function AdminLeavePage() {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("PENDING");

  // Review dialog
  const [reviewTarget, setReviewTarget] = useState<LeaveRequest | null>(null);
  const [reviewAction, setReviewAction] = useState<"approve" | "reject">("approve");
  const [reviewNote, setReviewNote] = useState("");
  const [reviewing, setReviewing] = useState(false);

  async function fetchData() {
    setLoading(true);
    const res = await fetch(`/api/leave/requests?status=${filter}`);
    setRequests(await res.json());
    setLoading(false);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { fetchData(); }, [filter]);

  function openReview(req: LeaveRequest, action: "approve" | "reject") {
    setReviewTarget(req);
    setReviewAction(action);
    setReviewNote("");
  }

  async function handleReview() {
    if (!reviewTarget) return;
    if (reviewAction === "reject" && !reviewNote.trim()) {
      toast.error("Alasan penolakan wajib diisi"); return;
    }
    setReviewing(true);
    const res = await fetch(`/api/leave/requests/${reviewTarget.id}/${reviewAction}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: reviewNote }),
    });
    if (res.ok) {
      toast.success(reviewAction === "approve" ? "Cuti disetujui" : "Cuti ditolak");
      setReviewTarget(null);
      fetchData();
    } else {
      const d = await res.json();
      toast.error(d.error || "Gagal memproses");
    }
    setReviewing(false);
  }

  const pendingCount = requests.filter(r => r.status === "PENDING").length;

  return (
    <>
      <PageHeader
        title="Pengajuan Cuti"
        description={pendingCount > 0 ? `${pendingCount} pengajuan menunggu persetujuan` : "Semua pengajuan sudah diproses"}
      />

      {/* Filter */}
      <div className="mb-4">
        <Select value={filter} onValueChange={(v) => v && setFilter(v)}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="PENDING">Menunggu</SelectItem>
            <SelectItem value="APPROVED">Disetujui</SelectItem>
            <SelectItem value="REJECTED">Ditolak</SelectItem>
            <SelectItem value="all">Semua</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Request list */}
      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-24 bg-card rounded-xl animate-pulse" />)}</div>
      ) : requests.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-sm">Tidak ada pengajuan cuti{filter !== "all" ? ` dengan status "${STATUS_MAP[filter]?.label ?? filter}"` : ""}.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {requests.map((r, i) => (
            <motion.div key={r.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
              <Card className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold">{r.employee.nama}</span>
                      <span className="font-currency text-[10px] text-muted-foreground">{r.employee.kode}</span>
                      <Badge variant="secondary" className={`text-[10px] ${STATUS_MAP[r.status]?.class ?? ""}`}>
                        {STATUS_MAP[r.status]?.label ?? r.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{r.employee.jabatan} · {r.employee.campus.name}</p>

                    <div className="mt-2 flex items-center gap-3 text-xs">
                      <Badge variant="outline" className="text-[10px]">{TYPE_LABELS[r.leaveType] ?? r.leaveType}</Badge>
                      <span className="text-muted-foreground">{r.startDate} — {r.endDate}</span>
                      <span className="font-medium">{r.days} hari</span>
                    </div>

                    <p className="text-xs mt-2">{r.reason}</p>
                    {r.reviewNote && <p className="text-xs text-muted-foreground mt-1 italic">Catatan: {r.reviewNote}</p>}
                  </div>

                  {r.status === "PENDING" && (
                    <div className="flex gap-1 shrink-0 ml-3">
                      <Button size="sm" variant="outline" className="h-8 text-[#00875A] border-[#00875A]/30 hover:bg-[#00875A]/10" onClick={() => openReview(r, "approve")}>
                        <Check size={14} className="mr-1" /> Setuju
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => openReview(r, "reject")}>
                        <X size={14} className="mr-1" /> Tolak
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Review dialog */}
      <Dialog open={!!reviewTarget} onOpenChange={(o) => !o && setReviewTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{reviewAction === "approve" ? "Setujui Cuti" : "Tolak Cuti"}</DialogTitle>
            <DialogDescription>
              {reviewTarget?.employee.nama} — {TYPE_LABELS[reviewTarget?.leaveType ?? ""] ?? reviewTarget?.leaveType} ({reviewTarget?.days} hari)
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div className="text-sm">
              <p><strong>Tanggal:</strong> {reviewTarget?.startDate} — {reviewTarget?.endDate}</p>
              <p><strong>Alasan:</strong> {reviewTarget?.reason}</p>
            </div>
            <div>
              <Label>{reviewAction === "approve" ? "Catatan (opsional)" : "Alasan penolakan *"}</Label>
              <Textarea value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} placeholder={reviewAction === "approve" ? "Catatan untuk karyawan..." : "Jelaskan alasan penolakan..."} rows={2} />
            </div>
            {reviewAction === "approve" && (
              <p className="text-xs text-muted-foreground">Menyetujui akan otomatis membuat record kehadiran LEAVE untuk tanggal tersebut.</p>
            )}
          </div>
          <DialogFooter>
            <DialogClose><Button variant="outline">Batal</Button></DialogClose>
            <Button
              onClick={handleReview}
              disabled={reviewing}
              className={reviewAction === "reject" ? "bg-destructive hover:bg-destructive/90" : ""}
            >
              {reviewing ? "Memproses..." : reviewAction === "approve" ? "Setujui" : "Tolak"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
