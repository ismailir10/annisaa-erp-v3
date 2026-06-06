"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/admin/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "sonner";
import { ClipboardList, AlertCircle, Plus } from "lucide-react";
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

function termLabel(t: Term) {
  return `Triwulan ${t.number} · Smt ${t.semester.number} ${t.semester.academicYear.name}`;
}

function StatusBadge({ status }: { status: string }) {
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
  const [showCreate, setShowCreate] = useState(false);

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
        <CreateTermCard semesters={semesters} onCreated={loadSelectors} />
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
            <Button variant="outline" size="sm" onClick={() => setShowCreate((s) => !s)}>
              <Plus className="size-4" /> Triwulan
            </Button>
          </div>

          {showCreate ? (
            <CreateTermCard
              semesters={semesters}
              onCreated={() => {
                setShowCreate(false);
                loadSelectors();
              }}
            />
          ) : null}

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
            <Card className="overflow-hidden p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="p-3 font-medium">Siswa</th>
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3 font-medium text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((r) => (
                    <tr key={r.studentId} className="border-t border-border">
                      <td className="p-3 font-medium">{r.name}</td>
                      <td className="p-3">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="p-3 text-right">
                        <Button size="sm" variant="outline" onClick={() => setSelected(r)}>
                          {r.status === "NONE" ? "Buat raport" : "Edit raport"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}

function CreateTermCard({
  semesters,
  onCreated,
}: {
  semesters: Semester[];
  onCreated: () => void;
}) {
  const [semesterId, setSemesterId] = useState("");
  const [number, setNumber] = useState("1");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!semesterId || !startDate || !endDate) {
      toast.error("Lengkapi semester dan tanggal triwulan.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/terms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ semesterId, number: Number(number), startDate, endDate }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "Gagal membuat triwulan.");
        return;
      }
      toast.success("Triwulan dibuat.");
      onCreated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-card mb-6">
      <h2 className="text-h2 font-semibold mb-1">Buat Triwulan</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Triwulan menentukan rentang tanggal penilaian & kehadiran yang dirangkum ke raport.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field>
          <FieldLabel htmlFor="t-sem">Semester</FieldLabel>
          <NativeSelect id="t-sem" className="w-full" value={semesterId} onChange={(e) => setSemesterId(e.target.value)}>
            <NativeSelectOption value="">— Pilih —</NativeSelectOption>
            {semesters.map((s) => (
              <NativeSelectOption key={s.id} value={s.id}>
                Smt {s.number} {s.academicYear.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="t-num">Triwulan ke-</FieldLabel>
          <NativeSelect id="t-num" className="w-full" value={number} onChange={(e) => setNumber(e.target.value)}>
            <NativeSelectOption value="1">1</NativeSelectOption>
            <NativeSelectOption value="2">2</NativeSelectOption>
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="t-start">Mulai</FieldLabel>
          <Input id="t-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="t-end">Selesai</FieldLabel>
          <Input id="t-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </Field>
      </div>
      <div className="mt-4">
        <Button onClick={submit} disabled={saving}>
          {saving ? "Menyimpan…" : "Simpan triwulan"}
        </Button>
      </div>
    </Card>
  );
}
