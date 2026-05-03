"use client";

import { useEffect, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/admin/page-header";
import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { AdminTabs, AdminTabsList, AdminTabsTrigger, AdminTabsContent } from "@/components/admin/admin-tabs";
import { ResponsiveFormDialog } from "@/components/ui/responsive-form-dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Field, FieldLabel } from "@/components/ui/field";
import { DataTableRowActions } from "@/components/ui/data-table-row-actions";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Save } from "lucide-react";
import { toast } from "sonner";
import { formatRupiah } from "@/lib/format";

type FeeComponent = { id: string; code: string; label: string; category: string; isRecurring: boolean; isEnabled: boolean; sortOrder: number };
type Program = { id: string; code: string; name: string };
type AcademicYear = { id: string; name: string; status: string };
type FeeStructure = { id: string; feeComponentId: string; amount: number; notes: string | null; feeComponent: FeeComponent };

const CATEGORY_LABELS: Record<string, string> = { TUITION: "SPP", REGISTRATION: "Pendaftaran", ACTIVITY: "Kegiatan", MATERIAL: "Bahan", OTHER: "Lainnya" };

export default function FeesPage() {
  const [components, setComponents] = useState<FeeComponent[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [componentDialog, setComponentDialog] = useState(false);
  const [editingFee, setEditingFee] = useState<FeeComponent | null>(null);
  const [form, setForm] = useState({ code: "", label: "", category: "TUITION", isRecurring: true, sortOrder: "0" });
  const [saving, setSaving] = useState(false);

  // Fee structure state
  const [selectedProgram, setSelectedProgram] = useState("");
  const [selectedYear, setSelectedYear] = useState("");
  const [, setStructures] = useState<FeeStructure[]>([]);
  const [structureAmounts, setStructureAmounts] = useState<Record<string, number>>({});
  const [structureLoading, setStructureLoading] = useState(false);
  const [structureSaving, setStructureSaving] = useState(false);

  async function fetchAll() {
    try {
      const [cRes, pRes, yRes] = await Promise.all([
        fetch("/api/fee-components"),
        fetch("/api/programs"),
        fetch("/api/academic-years"),
      ]);
      if (!cRes.ok || !pRes.ok || !yRes.ok) {
        toast.error("Gagal memuat data biaya");
        return;
      }
      const [c, p, y] = await Promise.all([cRes.json(), pRes.json(), yRes.json()]);
      setComponents(c); setPrograms(p); setYears(y);
    } catch {
      toast.error("Gagal memuat data biaya");
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchAll(); }, []);

  async function saveComponent() {
    setSaving(true);
    const url = editingFee ? `/api/fee-components/${editingFee.id}` : "/api/fee-components";
    const method = editingFee ? "PUT" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, sortOrder: parseInt(form.sortOrder) }) });
    if (res.ok) { toast.success(editingFee ? "Komponen diperbarui" : "Komponen biaya ditambahkan"); setComponentDialog(false); setEditingFee(null); fetchAll(); }
    else { const d = await res.json(); toast.error(d.error || "Gagal"); }
    setSaving(false);
  }

  async function toggleComponent(c: FeeComponent) {
    const res = await fetch(`/api/fee-components/${c.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isEnabled: !c.isEnabled }) });
    if (!res.ok) { toast.error("Gagal mengubah status komponen"); return; }
    fetchAll();
  }

  async function fetchStructure() {
    if (!selectedProgram || !selectedYear) return;
    setStructureLoading(true);
    try {
      const res = await fetch(`/api/fee-structure?programId=${selectedProgram}&academicYearId=${selectedYear}`);
      if (!res.ok) { toast.error("Gagal memuat struktur biaya"); return; }
      const data: FeeStructure[] = await res.json();
      setStructures(data);
      const amounts: Record<string, number> = {};
      // API returns Prisma Decimal serialized as string — coerce on ingest.
      for (const s of data) amounts[s.feeComponentId] = Number(s.amount) || 0;
      setStructureAmounts(amounts);
    } catch {
      toast.error("Gagal memuat struktur biaya");
    } finally {
      setStructureLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { fetchStructure(); }, [selectedProgram, selectedYear]);

  async function saveStructure() {
    setStructureSaving(true);
    const fees = components.filter(c => c.isEnabled).map(c => ({ feeComponentId: c.id, amount: structureAmounts[c.id] ?? 0 }));
    const res = await fetch("/api/fee-structure", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ programId: selectedProgram, academicYearId: selectedYear, fees }) });
    if (res.ok) { toast.success("Struktur biaya disimpan"); fetchStructure(); }
    else toast.error("Gagal menyimpan");
    setStructureSaving(false);
  }

  if (loading) return <Skeleton className="h-96 rounded-xl" />;

  const feeComponentColumns: ColumnDef<FeeComponent>[] = [
    {
      accessorKey: "sortOrder",
      header: ({ column }) => <DataTableColumnHeader column={column} title="#" />,
      cell: ({ row }) => <span className="font-currency text-xs text-muted-foreground">{row.original.sortOrder}</span>,
    },
    {
      accessorKey: "label",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Komponen" />,
      cell: ({ row }) => {
        const c = row.original;
        return (
          <div className={!c.isEnabled ? "opacity-50" : ""}>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{c.label}</span>
              <Badge variant="outline" className="text-xs font-currency">{c.code}</Badge>
            </div>
            <span className="text-xs text-muted-foreground">{c.isRecurring ? "Bulanan" : "Sekali bayar"}</span>
          </div>
        );
      },
    },
    {
      accessorKey: "category",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Kategori" />,
      cell: ({ row }) => <Badge variant="secondary" className="text-xs">{CATEGORY_LABELS[row.original.category] ?? row.original.category}</Badge>,
    },
    {
      id: "enabled",
      header: "Aktif",
      cell: ({ row }) => <Switch checked={row.original.isEnabled} onCheckedChange={() => toggleComponent(row.original)} />,
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <DataTableRowActions
          onEdit={() => {
            const c = row.original;
            setEditingFee(c);
            setForm({ code: c.code, label: c.label, category: c.category, isRecurring: c.isRecurring, sortOrder: String(c.sortOrder) });
            setComponentDialog(true);
          }}
          onDeactivate={row.original.isEnabled ? () => toggleComponent(row.original) : undefined}
          onActivate={!row.original.isEnabled ? () => toggleComponent(row.original) : undefined}
          isActive={row.original.isEnabled}
        />
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Biaya & Tagihan" description="Kelola komponen biaya dan struktur per program" />

      <AdminTabs defaultValue="components">
        <AdminTabsList>
          <AdminTabsTrigger value="components">Komponen Biaya</AdminTabsTrigger>
          <AdminTabsTrigger value="structure">Struktur per Program</AdminTabsTrigger>
        </AdminTabsList>

        {/* Fee Components */}
        <AdminTabsContent value="components">
          <div className="flex justify-end mb-4 mt-4">
            <Button size="sm" onClick={() => { setEditingFee(null); setForm({ code: "", label: "", category: "TUITION", isRecurring: true, sortOrder: String(components.length + 1) }); setComponentDialog(true); }}>
              <Plus size={14} className="mr-1.5" /> Tambah Komponen
            </Button>
          </div>
          <DataTable
            columns={feeComponentColumns}
            data={components}
            defaultSort={{ field: "sortOrder", order: "asc" }}
            emptyTitle="Belum ada komponen biaya"
            emptyDescription="Tambahkan komponen seperti SPP, Uang Pangkal, Seragam"
          />
        </AdminTabsContent>

        {/* Fee Structure per Program */}
        <AdminTabsContent value="structure">
          <div className="flex gap-3 mt-4 mb-4">
            <Select value={selectedProgram} onValueChange={v => v && setSelectedProgram(v)} items={programs.map(p => ({ label: p.name, value: p.id }))}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Pilih program" /></SelectTrigger>
              <SelectContent>{programs.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={selectedYear} onValueChange={v => v && setSelectedYear(v)} items={years.map(y => ({ label: y.name, value: y.id }))}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Pilih tahun ajaran" /></SelectTrigger>
              <SelectContent>{years.map(y => <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          {!selectedProgram || !selectedYear ? (
            <Card className="p-card text-center text-muted-foreground"><p className="text-sm">Pilih program dan tahun ajaran untuk mengatur biaya.</p></Card>
          ) : structureLoading ? (
            <Skeleton className="h-40 rounded-xl" />
          ) : (
            <Card className="p-card">
              <div className="space-y-3">
                {components.filter(c => c.isEnabled).map(c => (
                  <div key={c.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div>
                      <p className="text-sm font-medium">{c.label}</p>
                      <p className="text-xs text-muted-foreground">{c.isRecurring ? "Bulanan" : "Sekali bayar"}</p>
                    </div>
                    <div className="w-40">
                      <Input
                        type="number"
                        value={structureAmounts[c.id] ?? 0}
                        onChange={e => setStructureAmounts({ ...structureAmounts, [c.id]: parseFloat(e.target.value) || 0 })}
                        className="font-currency text-right"
                        placeholder="0"
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                <p className="text-sm font-semibold">Total Komponen: <span className="font-currency text-primary">{formatRupiah(Object.values(structureAmounts).reduce<number>((s, v) => s + (Number(v) || 0), 0))}</span></p>
                <Button onClick={saveStructure} disabled={structureSaving}>
                  <Save size={14} className="mr-1.5" /> {structureSaving ? "Menyimpan..." : "Simpan Struktur"}
                </Button>
              </div>
            </Card>
          )}
        </AdminTabsContent>
      </AdminTabs>

      {/* Add Component Dialog */}
      <ResponsiveFormDialog
        open={componentDialog}
        onOpenChange={setComponentDialog}
        title={editingFee ? "Edit Komponen Biaya" : "Tambah Komponen Biaya"}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setComponentDialog(false)} disabled={saving}>Batal</Button>
            <Button onClick={saveComponent} disabled={saving}>{saving ? "Menyimpan..." : editingFee ? "Simpan Perubahan" : "Tambah Komponen Biaya"}</Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <Field><FieldLabel required>Kode</FieldLabel><Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="spp" /></Field>
          <Field><FieldLabel required>Label</FieldLabel><Input value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} placeholder="SPP Bulanan" /></Field>
        </div>
        <Field>
          <FieldLabel>Kategori</FieldLabel>
          <Select value={form.category} onValueChange={v => v && setForm({ ...form, category: v })} items={CATEGORY_LABELS}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="TUITION">SPP</SelectItem>
              <SelectItem value="REGISTRATION">Pendaftaran</SelectItem>
              <SelectItem value="ACTIVITY">Kegiatan</SelectItem>
              <SelectItem value="MATERIAL">Bahan</SelectItem>
              <SelectItem value="OTHER">Lainnya</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field><FieldLabel>Urutan</FieldLabel><Input type="number" value={form.sortOrder} onChange={e => setForm({ ...form, sortOrder: e.target.value })} /></Field>
          <Field>
            <FieldLabel>Tipe</FieldLabel>
            <Select value={form.isRecurring ? "true" : "false"} onValueChange={v => setForm({ ...form, isRecurring: v === "true" })} items={{ "true": "Bulanan (berulang)", "false": "Sekali bayar" }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Bulanan (berulang)</SelectItem>
                <SelectItem value="false">Sekali bayar</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
      </ResponsiveFormDialog>
    </>
  );
}
