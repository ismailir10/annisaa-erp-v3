"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Field, FieldLabel } from "@/components/ui/field";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Building2, MapPin, Plus, Pencil, Trash2, LocateFixed } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

type Campus = {
  id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  _count: { employees: number };
};

export default function CampusesPage() {
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Campus | null>(null);
  const [form, setForm] = useState({ name: "", address: "", lat: "", lng: "" });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Campus | null>(null);

  async function fetchCampuses() {
    const res = await fetch("/api/config/campuses");
    setCampuses(await res.json());
    setLoading(false);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchCampuses(); }, []);

  function openNew() {
    setEditing(null);
    setForm({ name: "", address: "", lat: "", lng: "" });
    setDialogOpen(true);
  }

  function openEdit(c: Campus) {
    setEditing(c);
    setForm({
      name: c.name,
      address: c.address ?? "",
      lat: c.lat?.toString() ?? "",
      lng: c.lng?.toString() ?? "",
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error("Nama wajib diisi"); return; }
    setSaving(true);
    const url = editing ? `/api/config/campuses/${editing.id}` : "/api/config/campuses";
    const method = editing ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      toast.success(editing ? "Kampus diperbarui" : "Kampus ditambahkan");
      setDialogOpen(false);
      fetchCampuses();
    } else {
      const data = await res.json();
      toast.error(data.error || "Gagal menyimpan");
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/config/campuses/${deleteTarget.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Kampus dihapus");
      setDeleteTarget(null);
      fetchCampuses();
    } else {
      const data = await res.json();
      toast.error(data.error || "Gagal menghapus");
    }
  }

  function getCurrentLocation() {
    if (!navigator.geolocation) { toast.error("GPS tidak tersedia"); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({
          ...f,
          lat: pos.coords.latitude.toFixed(8),
          lng: pos.coords.longitude.toFixed(8),
        }));
        toast.success("Lokasi diperoleh");
      },
      () => toast.error("Gagal mendapatkan lokasi")
    );
  }

  return (
    <>
      <PageHeader
        title="Kampus"
        description="Kelola lokasi kampus/cabang sekolah"
        actions={
          <Button onClick={openNew} size="sm">
            <Plus size={16} className="mr-1.5" /> Tambah Kampus
          </Button>
        }
      />

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {campuses.map((c, i) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className="p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <Building2 size={18} className="text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm">{c.name}</h3>
                      {c.address && (
                        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                          <MapPin size={12} /> {c.address}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {c._count.employees} karyawan
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(c)} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => setDeleteTarget(c)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Kampus" : "Tambah Kampus"}</DialogTitle>
            <DialogDescription>
              {editing ? "Perbarui informasi kampus" : "Tambahkan lokasi kampus baru"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-field py-2">
            <Field>
              <FieldLabel>Nama *</FieldLabel>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Taman Aster" />
            </Field>
            <Field>
              <FieldLabel>Alamat</FieldLabel>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Jl. Contoh No.1, Bekasi" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel>Latitude</FieldLabel>
                <Input value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} placeholder="-6.2234" type="number" step="any" />
              </Field>
              <Field>
                <FieldLabel>Longitude</FieldLabel>
                <Input value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} placeholder="106.8432" type="number" step="any" />
              </Field>
            </div>
            <Button variant="outline" size="sm" onClick={getCurrentLocation} type="button">
              <LocateFixed size={14} className="mr-1.5" /> Ambil Lokasi Saat Ini
            </Button>
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

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Hapus Kampus"
        description={`Hapus "${deleteTarget?.name}"? Kampus yang memiliki karyawan tidak bisa dihapus.`}
        onConfirm={handleDelete}
        confirmLabel="Hapus"
      />
    </>
  );
}
