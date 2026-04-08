"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Pencil, Trash2, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

type Holiday = {
  id: string;
  date: string;
  name: string;
  type: string;
  isHalfDay: boolean;
};

const TYPE_LABELS: Record<string, string> = {
  NATIONAL: "Nasional",
  ISLAMIC: "Islam",
  SCHOOL_CLOSURE: "Sekolah",
};

const TYPE_COLORS: Record<string, string> = {
  NATIONAL: "bg-status-holiday-subtle text-[#6B21A8]",
  ISLAMIC: "bg-status-leave-subtle text-[#0369A1]",
  SCHOOL_CLOSURE: "bg-status-late-subtle text-[#B35C00]",
};

export default function HolidaysPage() {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Holiday | null>(null);
  const [form, setForm] = useState({ date: "", name: "", type: "NATIONAL", isHalfDay: false });
  const [saving, setSaving] = useState(false);

  async function fetchHolidays() {
    const res = await fetch("/api/config/holidays");
    setHolidays(await res.json());
    setLoading(false);
  }

  useEffect(() => { fetchHolidays(); }, []);

  function openNew() {
    setEditing(null);
    setForm({ date: "", name: "", type: "NATIONAL", isHalfDay: false });
    setDialogOpen(true);
  }

  function openEdit(h: Holiday) {
    setEditing(h);
    setForm({ date: h.date, name: h.name, type: h.type, isHalfDay: h.isHalfDay });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.date || !form.name.trim()) { toast.error("Tanggal dan nama wajib diisi"); return; }
    setSaving(true);
    const url = editing ? `/api/config/holidays/${editing.id}` : "/api/config/holidays";
    const method = editing ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      toast.success(editing ? "Hari libur diperbarui" : "Hari libur ditambahkan");
      setDialogOpen(false);
      fetchHolidays();
    } else {
      const data = await res.json();
      toast.error(data.error || "Gagal menyimpan");
    }
    setSaving(false);
  }

  async function handleDelete(h: Holiday) {
    if (!confirm(`Hapus "${h.name}"?`)) return;
    const res = await fetch(`/api/config/holidays/${h.id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Dihapus"); fetchHolidays(); }
    else toast.error("Gagal menghapus");
  }

  // Group by month
  const grouped: Record<string, Holiday[]> = {};
  for (const h of holidays) {
    const month = h.date.slice(0, 7);
    if (!grouped[month]) grouped[month] = [];
    grouped[month].push(h);
  }

  const formatMonth = (ym: string) => {
    const [y, m] = ym.split("-");
    return new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" });
  };

  return (
    <>
      <PageHeader
        title="Hari Libur"
        description={`${holidays.length} hari libur terdaftar`}
        actions={
          <Button onClick={openNew} size="sm">
            <Plus size={16} className="mr-1.5" /> Tambah
          </Button>
        }
      />

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-card rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([month, items]) => (
            <div key={month}>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
                <CalendarDays size={14} /> {formatMonth(month)}
              </h3>
              <div className="space-y-1">
                {items.map((h, i) => (
                  <motion.div
                    key={h.id}
                    initial={{ opacity: 0, x: -5 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.02 }}
                    className="flex items-center justify-between p-3 bg-card border border-border rounded-lg hover:border-primary/20 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-currency text-xs text-muted-foreground w-12">
                        {new Date(h.date + "T00:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
                      </span>
                      <span className="text-sm font-medium">{h.name}</span>
                      <Badge variant="secondary" className={`text-[10px] ${TYPE_COLORS[h.type] ?? ""}`}>
                        {TYPE_LABELS[h.type] ?? h.type}
                      </Badge>
                      {h.isHalfDay && <Badge variant="outline" className="text-[10px]">½ Hari</Badge>}
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(h)} className="p-1 rounded hover:bg-accent text-muted-foreground">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => handleDelete(h)} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Hari Libur" : "Tambah Hari Libur"}</DialogTitle>
            <DialogDescription>Hari libur mempengaruhi perhitungan hari kerja</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Tanggal *</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div>
              <Label>Nama *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Hari Raya Idul Fitri" />
            </div>
            <div>
              <Label>Tipe</Label>
              <Select value={form.type} onValueChange={(v) => v && setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NATIONAL">Nasional</SelectItem>
                  <SelectItem value="ISLAMIC">Islam</SelectItem>
                  <SelectItem value="SCHOOL_CLOSURE">Penutupan Sekolah</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.isHalfDay} onCheckedChange={(c) => setForm({ ...form, isHalfDay: !!c })} />
              Setengah hari
            </label>
          </div>
          <DialogFooter>
            <DialogClose>
              <Button variant="outline">Batal</Button>
            </DialogClose>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
