"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import {
  CategoryAccordion,
  type CategoryDTO,
  type IndicatorDTO,
} from "@/components/student-journal/category-accordion";

type Scope = "SCHOOL" | "HOME";
type StatusFilter = "ALL" | "ACTIVE" | "INACTIVE";

const SCOPE_LABEL: Record<Scope, string> = {
  SCHOOL: "Sekolah",
  HOME: "Rumah",
};

type CategoryFormState = {
  mode: "create" | "edit";
  id?: string;
  name: string;
  scope: Scope;
};

type IndicatorFormState = {
  mode: "create" | "edit";
  id?: string;
  categoryId: string;
  categoryName: string;
  label: string;
};

export default function StudentJournalAdminPage() {
  const [scope, setScope] = useState<Scope>("SCHOOL");
  const [status, setStatus] = useState<StatusFilter>("ACTIVE");
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [loading, setLoading] = useState(true);

  const [categoryForm, setCategoryForm] = useState<CategoryFormState | null>(null);
  const [indicatorForm, setIndicatorForm] = useState<IndicatorFormState | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (s: Scope, st: StatusFilter) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/student-journal/categories?scope=${s}&status=${st}`,
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Gagal memuat kategori");
        setCategories([]);
        return;
      }
      const json = await res.json();
      setCategories(json.data as CategoryDTO[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(scope, status);
  }, [scope, status, load]);

  // ------- Category form -------

  function openCreateCategory() {
    setCategoryForm({ mode: "create", name: "", scope });
  }

  function openEditCategory(cat: CategoryDTO) {
    setCategoryForm({ mode: "edit", id: cat.id, name: cat.name, scope: cat.scope });
  }

  async function saveCategory() {
    if (!categoryForm) return;
    const trimmed = categoryForm.name.trim();
    if (!trimmed) {
      toast.error("Nama kategori wajib diisi");
      return;
    }
    setSaving(true);
    try {
      const url =
        categoryForm.mode === "create"
          ? "/api/student-journal/categories"
          : `/api/student-journal/categories/${categoryForm.id}`;
      const method = categoryForm.mode === "create" ? "POST" : "PUT";
      const body =
        categoryForm.mode === "create"
          ? { name: trimmed, scope: categoryForm.scope, order: categories.length }
          : { name: trimmed, scope: categoryForm.scope };

      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Gagal menyimpan kategori");
        return;
      }
      toast.success(
        categoryForm.mode === "create" ? "Kategori ditambahkan" : "Kategori diperbarui",
      );
      setCategoryForm(null);
      // If the scope changed in edit mode, load may not show it — but we stay on current tab.
      if (categoryForm.mode === "create" && categoryForm.scope !== scope) {
        setScope(categoryForm.scope);
      } else {
        await load(scope, status);
      }
    } finally {
      setSaving(false);
    }
  }

  // ------- Indicator form -------

  function openCreateIndicator(cat: CategoryDTO) {
    setIndicatorForm({
      mode: "create",
      categoryId: cat.id,
      categoryName: cat.name,
      label: "",
    });
  }

  function openEditIndicator(ind: IndicatorDTO, cat: CategoryDTO) {
    setIndicatorForm({
      mode: "edit",
      id: ind.id,
      categoryId: cat.id,
      categoryName: cat.name,
      label: ind.label,
    });
  }

  async function saveIndicator() {
    if (!indicatorForm) return;
    const trimmed = indicatorForm.label.trim();
    if (!trimmed) {
      toast.error("Label indikator wajib diisi");
      return;
    }
    setSaving(true);
    try {
      const url =
        indicatorForm.mode === "create"
          ? "/api/student-journal/indicators"
          : `/api/student-journal/indicators/${indicatorForm.id}`;
      const method = indicatorForm.mode === "create" ? "POST" : "PUT";

      // Pick an order slot at the end of the category's current indicators.
      const parent = categories.find((c) => c.id === indicatorForm.categoryId);
      const nextOrder = parent ? parent.indicators.length : 0;

      const body =
        indicatorForm.mode === "create"
          ? { categoryId: indicatorForm.categoryId, label: trimmed, order: nextOrder }
          : { label: trimmed };

      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Gagal menyimpan indikator");
        return;
      }
      toast.success(
        indicatorForm.mode === "create" ? "Indikator ditambahkan" : "Indikator diperbarui",
      );
      setIndicatorForm(null);
      await load(scope, status);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        title="Buku Penghubung — Template"
        description="Atur kategori dan indikator untuk sekolah dan rumah."
        actions={
          <Button onClick={openCreateCategory}>
            <Plus className="w-4 h-4 mr-2" /> Tambah Kategori
          </Button>
        }
      />

      <Tabs value={scope} onValueChange={(v) => setScope(v as Scope)}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList>
            <TabsTrigger value="SCHOOL">Sekolah</TabsTrigger>
            <TabsTrigger value="HOME">Rumah</TabsTrigger>
          </TabsList>
          <div className="w-full sm:w-48">
            <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua Status</SelectItem>
                <SelectItem value="ACTIVE">Aktif</SelectItem>
                <SelectItem value="INACTIVE">Tidak Aktif</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <TabsContent value="SCHOOL" className="mt-4">
          <CategoryAccordion
            categories={categories}
            loading={loading}
            onRefresh={() => load(scope, status)}
            onEditCategory={openEditCategory}
            onAddIndicator={openCreateIndicator}
            onEditIndicator={openEditIndicator}
          />
        </TabsContent>
        <TabsContent value="HOME" className="mt-4">
          <CategoryAccordion
            categories={categories}
            loading={loading}
            onRefresh={() => load(scope, status)}
            onEditCategory={openEditCategory}
            onAddIndicator={openCreateIndicator}
            onEditIndicator={openEditIndicator}
          />
        </TabsContent>
      </Tabs>

      {/* Category create/edit dialog */}
      <Dialog
        open={categoryForm !== null}
        onOpenChange={(o) => { if (!o) setCategoryForm(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {categoryForm?.mode === "create" ? "Tambah Kategori" : "Edit Kategori"}
            </DialogTitle>
          </DialogHeader>
          {categoryForm && (
            <div className="space-y-4">
              <Field>
                <FieldLabel>Nama Kategori</FieldLabel>
                <Input
                  value={categoryForm.name}
                  onChange={(e) =>
                    setCategoryForm({ ...categoryForm, name: e.target.value })
                  }
                  placeholder="Contoh: Ibadah"
                  autoFocus
                />
              </Field>
              <Field>
                <FieldLabel>Lingkup</FieldLabel>
                <Select
                  value={categoryForm.scope}
                  onValueChange={(v) =>
                    setCategoryForm({ ...categoryForm, scope: v as Scope })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SCHOOL">{SCOPE_LABEL.SCHOOL}</SelectItem>
                    <SelectItem value="HOME">{SCOPE_LABEL.HOME}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCategoryForm(null)}
              disabled={saving}
            >
              Batal
            </Button>
            <Button onClick={saveCategory} disabled={saving}>
              {saving ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Indicator create/edit dialog */}
      <Dialog
        open={indicatorForm !== null}
        onOpenChange={(o) => { if (!o) setIndicatorForm(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {indicatorForm?.mode === "create"
                ? `Tambah Indikator — ${indicatorForm.categoryName}`
                : "Edit Indikator"}
            </DialogTitle>
          </DialogHeader>
          {indicatorForm && (
            <div className="space-y-4">
              <Field>
                <FieldLabel>Label Indikator</FieldLabel>
                <Input
                  value={indicatorForm.label}
                  onChange={(e) =>
                    setIndicatorForm({ ...indicatorForm, label: e.target.value })
                  }
                  placeholder="Contoh: Tahfizul Qur'an"
                  autoFocus
                />
              </Field>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIndicatorForm(null)}
              disabled={saving}
            >
              Batal
            </Button>
            <Button onClick={saveIndicator} disabled={saving}>
              {saving ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
