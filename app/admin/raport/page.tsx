"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { DataTableRowActions } from "@/components/ui/data-table-row-actions";
import { DataTableToolbar } from "@/components/ui/data-table-toolbar";
import { ResponsiveFormDialog } from "@/components/ui/responsive-form-dialog";
import { toast } from "sonner";
import { ClipboardList, AlertCircle, Pencil, Plus } from "lucide-react";
import { RaportEditor } from "./raport-editor";

type Term = {
  id: string;
  number: number;
  startDate: string;
  endDate: string;
  publishedAt: string | null;
  semester: { id: string; number: number; academicYear: { name: string } };
};
type ClassRow = { id: string; name: string; status: string };
type Semester = { id: string; number: number; academicYear: { name: string } };
type RosterRow = { studentId: string; name: string; nickname: string | null; status: string };

type TermDialogState =
  | { mode: "create"; term?: undefined }
  | { mode: "edit"; term: Term }
  | null;

function termLabel(t: Term) {
  return `Triwulan ${t.number} · Smt ${t.semester.number} ${t.semester.academicYear.name}`;
}

function toJakartaYmd(value: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(new Date(value))
    .reduce<Record<string, string>>((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function RaportStatusBadge({ status }: { status: string }) {
  if (status === "PUBLISHED") {
    return (
      <Badge variant="outline" className="bg-status-present/10 text-status-present border-status-present/20">
        Terbit
      </Badge>
    );
  }
  if (status === "DRAFT") {
    return <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">Draft</Badge>;
  }
  return <Badge variant="outline" className="text-muted-foreground">Belum dibuat</Badge>;
}

export default function AdminRaportPage() {
  const [terms, setTerms] = useState<Term[] | null>(null);
  const [classes, setClasses] = useState<ClassRow[] | null>(null);
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [termId, setTermId] = useState("");
  const [classId, setClassId] = useState("");
  const [roster, setRoster] = useState<RosterRow[] | null>(null);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [selected, setSelected] = useState<RosterRow | null>(null);
  const [termDialog, setTermDialog] = useState<TermDialogState>(null);
  const [rosterSearch, setRosterSearch] = useState("");
  const [rosterStatus, setRosterStatus] = useState("all");

  const loadSelectors = useCallback(async () => {
    // Settle each selector independently — one failing fetch (e.g. the raport
    // tables not yet migrated on a preview DB) must not blank the others.
    async function fetchData<T>(url: string): Promise<T[]> {
      try {
        const res = await fetch(url);
        if (!res.ok) return [];
        const json = (await res.json()) as { data?: T[] };
        return json.data ?? [];
      } catch {
        return [];
      }
    }
    const [termData, classData, semData] = await Promise.all([
      fetchData<Term>("/api/admin/terms"),
      fetchData<ClassRow>("/api/admin/classes?pageSize=200"),
      fetchData<Semester>("/api/admin/curriculum/semesters?status=ACTIVE&pageSize=50"),
    ]);
    setTerms(termData);
    setClasses(classData.filter((c) => c.status === "ACTIVE"));
    setSemesters(semData);
  }, []);

  useEffect(() => {
    loadSelectors();
  }, [loadSelectors]);

  const loadRoster = useCallback(async () => {
    if (!termId || !classId) {
      setRoster(null);
      return;
    }
    setLoadingRoster(true);
    setRosterError(null);
    try {
      const res = await fetch(`/api/admin/raport?termId=${termId}&classSectionId=${classId}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setRosterError(body.error ?? "Gagal memuat daftar siswa.");
        setRoster(null);
        return;
      }
      const json = (await res.json()) as { data: { roster: RosterRow[] } };
      setRoster(json.data.roster);
    } catch {
      setRosterError("Gagal memuat daftar siswa.");
      setRoster(null);
    } finally {
      setLoadingRoster(false);
    }
  }, [termId, classId]);

  useEffect(() => {
    loadRoster();
  }, [loadRoster]);

  const currentTerm = useMemo(
    () => (terms ?? []).find((term) => term.id === termId) ?? null,
    [terms, termId],
  );

  const filteredRoster = useMemo(() => {
    const query = rosterSearch.trim().toLowerCase();
    return (roster ?? []).filter((row) => {
      const matchesQuery =
        !query ||
        row.name.toLowerCase().includes(query) ||
        (row.nickname ?? "").toLowerCase().includes(query);
      const matchesStatus = rosterStatus === "all" || row.status === rosterStatus;
      return matchesQuery && matchesStatus;
    });
  }, [roster, rosterSearch, rosterStatus]);

  const rosterColumns = useMemo<ColumnDef<RosterRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Siswa" />,
        cell: ({ row }) => (
          <div>
            <p className="font-medium">{row.original.name}</p>
            {row.original.nickname ? (
              <p className="text-xs text-muted-foreground">{row.original.nickname}</p>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => <RaportStatusBadge status={row.original.status} />,
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <DataTableRowActions onView={() => setSelected(row.original)} />
        ),
      },
    ],
    [],
  );

  if (selected && termId) {
    return (
      <RaportEditor
        studentId={selected.studentId}
        termId={termId}
        onBack={() => {
          setSelected(null);
          loadRoster();
        }}
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="Raport"
        description="Susun & terbitkan raport triwulan — terisi otomatis dari penilaian, dapat disunting."
      />

      {terms !== null && terms.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Belum ada triwulan."
          description="Buat triwulan untuk menentukan rentang penilaian dan kehadiran yang dirangkum ke raport."
          actionLabel="Buat Triwulan"
          onAction={() => setTermDialog({ mode: "create" })}
        />
      ) : (
        <>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end mb-6">
            <Field className="sm:w-72">
              <FieldLabel htmlFor="term">Triwulan</FieldLabel>
              <NativeSelect id="term" className="w-full" value={termId} onChange={(e) => setTermId(e.target.value)}>
                <NativeSelectOption value="">— Pilih triwulan —</NativeSelectOption>
                {(terms ?? []).map((t) => (
                  <NativeSelectOption key={t.id} value={t.id}>
                    {termLabel(t)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field className="sm:w-64">
              <FieldLabel htmlFor="class">Kelas</FieldLabel>
              <NativeSelect id="class" className="w-full" value={classId} onChange={(e) => setClassId(e.target.value)}>
                <NativeSelectOption value="">— Pilih kelas —</NativeSelectOption>
                {(classes ?? []).map((c) => (
                  <NativeSelectOption key={c.id} value={c.id}>
                    {c.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Button variant="outline" size="sm" onClick={() => setTermDialog({ mode: "create" })}>
              <Plus className="size-4" /> Triwulan
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => currentTerm && setTermDialog({ mode: "edit", term: currentTerm })}
              disabled={!currentTerm}
            >
              <Pencil className="size-4" /> Edit Triwulan
            </Button>
          </div>

          {!termId || !classId ? (
            <EmptyState
              icon={ClipboardList}
              title="Pilih triwulan & kelas."
              description="Pilih triwulan dan kelas untuk melihat daftar siswa dan menyusun raport."
            />
          ) : rosterError ? (
            <EmptyState
              icon={AlertCircle}
              title="Tidak dapat memuat daftar."
              description={rosterError}
              actionLabel="Coba lagi"
              onAction={loadRoster}
            />
          ) : loadingRoster ? (
            <div className="space-y-3" aria-busy="true" aria-live="polite">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : roster && roster.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="Belum ada siswa aktif di kelas ini."
              description="Pastikan siswa terdaftar aktif pada kelas terpilih."
            />
          ) : roster ? (
            <>
              <DataTableToolbar
                searchPlaceholder="Cari siswa atau panggilan..."
                value={rosterSearch}
                onValueChange={setRosterSearch}
                filters={[
                  {
                    key: "status",
                    label: "Status",
                    value: rosterStatus,
                    resetValue: "all",
                    onChange: setRosterStatus,
                    options: [
                      { value: "all", label: "Semua Status" },
                      { value: "NONE", label: "Belum Dibuat" },
                      { value: "DRAFT", label: "Draft" },
                      { value: "PUBLISHED", label: "Terbit" },
                    ],
                  },
                ]}
              />
              <DataTable
                columns={rosterColumns}
                data={filteredRoster}
                pagination={{
                  page: 1,
                  pageSize: 10,
                  total: filteredRoster.length,
                  totalPages: Math.max(1, Math.ceil(filteredRoster.length / 10)),
                }}
                emptyTitle="Tidak ada siswa sesuai filter."
                emptyDescription="Ubah pencarian atau status raport untuk melihat daftar siswa."
              />
            </>
          ) : null}
        </>
      )}

      <TermFormDialog
        open={termDialog !== null}
        mode={termDialog?.mode ?? "create"}
        term={termDialog?.mode === "edit" ? termDialog.term : null}
        semesters={semesters}
        onOpenChange={(open) => {
          if (!open) setTermDialog(null);
        }}
        onSaved={(savedTermId) => {
          setTermDialog(null);
          setTermId(savedTermId);
          loadSelectors();
        }}
      />
    </div>
  );
}

function TermFormDialog({
  open,
  mode,
  term,
  semesters,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  mode: "create" | "edit";
  term: Term | null;
  semesters: Semester[];
  onOpenChange: (open: boolean) => void;
  onSaved: (termId: string) => void;
}) {
  const [semesterId, setSemesterId] = useState("");
  const [number, setNumber] = useState("1");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSemesterId(term?.semester.id ?? "");
    setNumber(String(term?.number ?? 1));
    setStartDate(term ? toJakartaYmd(term.startDate) : "");
    setEndDate(term ? toJakartaYmd(term.endDate) : "");
  }, [open, term]);

  const submit = async () => {
    if (!semesterId || !startDate || !endDate) {
      toast.error("Lengkapi semester dan tanggal triwulan.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(mode === "edit" && term ? `/api/admin/terms/${term.id}` : "/api/admin/terms", {
        method: mode === "edit" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "edit"
            ? { number: Number(number), startDate, endDate }
            : { semesterId, number: Number(number), startDate, endDate },
        ),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? (mode === "edit" ? "Gagal menyimpan triwulan." : "Gagal membuat triwulan."));
        return;
      }
      const body = (await res.json()) as { data?: { id: string } };
      toast.success(mode === "edit" ? "Triwulan disimpan." : "Triwulan dibuat.");
      onSaved(body.data?.id ?? term?.id ?? "");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={mode === "edit" ? "Edit Triwulan" : "Buat Triwulan"}
      description="Triwulan menentukan rentang tanggal penilaian dan kehadiran yang dirangkum ke raport."
      size="lg"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Batal
          </Button>
          <Button type="button" onClick={submit} disabled={saving}>
            {saving ? "Menyimpan..." : mode === "edit" ? "Simpan Perubahan" : "Tambah Triwulan"}
          </Button>
        </>
      }
    >
        <Field>
          <FieldLabel htmlFor="t-sem" required>Semester</FieldLabel>
          <NativeSelect
            id="t-sem"
            className="w-full"
            value={semesterId}
            onChange={(e) => setSemesterId(e.target.value)}
            required
            disabled={mode === "edit"}
          >
            <NativeSelectOption value="">— Pilih —</NativeSelectOption>
            {semesters.map((s) => (
              <NativeSelectOption key={s.id} value={s.id}>
                Smt {s.number} {s.academicYear.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="t-num" required>Triwulan ke-</FieldLabel>
          <NativeSelect id="t-num" className="w-full" value={number} onChange={(e) => setNumber(e.target.value)} required>
            <NativeSelectOption value="1">1</NativeSelectOption>
            <NativeSelectOption value="2">2</NativeSelectOption>
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="t-start" required>Mulai</FieldLabel>
          <Input id="t-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
        </Field>
        <Field>
          <FieldLabel htmlFor="t-end" required>Selesai</FieldLabel>
          <Input id="t-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
        </Field>
    </ResponsiveFormDialog>
  );
}
