"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Pencil, Coins } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

type Component = {
  id: string;
  code: string;
  label: string;
  category: string;
  calcType: string;
  isProRated: boolean;
  isEnabled: boolean;
  sortOrder: number;
};

const CALC_LABELS: Record<string, string> = {
  FIXED: "Tetap",
  PCT_OF_BASE: "% Gaji Pokok",
  ATTENDANCE_BASED: "Berbasis Kehadiran",
};

export default function SalaryComponentsPage() {
  const [components, setComponents] = useState<Component[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Component | null>(null);
  const [form, setForm] = useState({
    code: "", label: "", category: "INCOME", calcType: "FIXED", isProRated: false, sortOrder: "0",
  });
  const [saving, setSaving] = useState(false);

  async function fetchComponents() {
    const res = await fetch("/api/salary-components");
    setComponents(await res.json());
    setLoading(false);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchComponents(); }, []);

  function openNew() {
    setEditing(null);
    setForm({ code: "", label: "", category: "INCOME", calcType: "FIXED", isProRated: false, sortOrder: String(components.length + 1) });
    setDialogOpen(true);
  }

  function openEdit(c: Component) {
    setEditing(c);
    setForm({
      code: c.code, label: c.label, category: c.category, calcType: c.calcType,
      isProRated: c.isProRated, sortOrder: String(c.sortOrder),
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.label.trim()) { toast.error("Label wajib diisi"); return; }
    if (!editing && !form.code.trim()) { toast.error("Kode wajib diisi"); return; }
    setSaving(true);
    const url = editing ? `/api/salary-components/${editing.id}` : "/api/salary-components";
    const method = editing ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, sortOrder: parseInt(form.sortOrder) }),
    });
    if (res.ok) {
      toast.success(editing ? "Komponen diperbarui" : "Komponen ditambahkan");
      setDialogOpen(false);
      fetchComponents();
    } else {
      const data = await res.json();
      toast.error(data.error || "Gagal menyimpan");
    }
    setSaving(false);
  }

  async function toggleEnabled(c: Component) {
    await fetch(`/api/salary-components/${c.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isEnabled: !c.isEnabled }),
    });
    fetchComponents();
  }

  return (
    <>
      <PageHeader
        title="Komponen Gaji"
        description="Konfigurasi komponen pendapatan dan potongan"
        actions={
          <Button onClick={openNew} size="sm">
            <Plus size={16} className="mr-1.5" /> Tambah Komponen
          </Button>
        }
      />

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-14 bg-card rounded-lg animate-pulse" />)}</div>
      ) : (
        <div className="space-y-1">
          {components.map((c, i) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, x: -5 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.02 }}
              className={`flex items-center justify-between p-3 bg-card border border-border rounded-lg hover:border-primary/20 transition-colors ${!c.isEnabled ? "opacity-50" : ""}`}
            >
              <div className="flex items-center gap-3">
                <span className="font-currency text-xs text-muted-foreground w-6 text-right">{c.sortOrder}</span>
                <div className="w-8 h-8 rounded-lg bg-primary/5 flex items-center justify-center">
                  <Coins size={14} className="text-primary" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{c.label}</span>
                    <Badge variant="outline" className="text-[10px] font-currency">{c.code}</Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="secondary" className={`text-[10px] ${c.category === "INCOME" ? "bg-status-present-subtle text-[#00875A]" : "bg-status-absent-subtle text-[#CC0000]"}`}>
                      {c.category === "INCOME" ? "Pendapatan" : "Potongan"}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">{CALC_LABELS[c.calcType]}</span>
                    {c.isProRated && <span className="text-[10px] text-muted-foreground">• Pro-rata</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={c.isEnabled} onCheckedChange={() => toggleEnabled(c)} />
                <button onClick={() => openEdit(c)} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground">
                  <Pencil size={13} />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Komponen" : "Tambah Komponen"}</DialogTitle>
            <DialogDescription>Komponen gaji menentukan struktur penggajian</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {!editing && (
              <div>
                <Label>Kode *</Label>
                <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="tunjangan_baru" />
              </div>
            )}
            <div>
              <Label>Label *</Label>
              <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Tunjangan Baru" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Kategori</Label>
                <Select value={form.category} onValueChange={(v) => v && setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INCOME">Pendapatan</SelectItem>
                    <SelectItem value="DEDUCTION">Potongan</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tipe Kalkulasi</Label>
                <Select value={form.calcType} onValueChange={(v) => v && setForm({ ...form, calcType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FIXED">Tetap</SelectItem>
                    <SelectItem value="PCT_OF_BASE">% Gaji Pokok</SelectItem>
                    <SelectItem value="ATTENDANCE_BASED">Berbasis Kehadiran</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Urutan</Label>
              <Input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.isProRated} onCheckedChange={(c) => setForm({ ...form, isProRated: !!c })} />
              Pro-rata (dihitung berdasarkan hari hadir)
            </label>
          </div>
          <DialogFooter>
            <DialogClose><Button variant="outline">Batal</Button></DialogClose>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
