"use client";

import { useCallback, useEffect, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/admin/page-header";
import { DataTable } from "@/components/ui/data-table";
import { DataTableToolbar } from "@/components/ui/data-table-toolbar";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  EDUCATION_OPTIONS,
  OCCUPATION_OPTIONS,
  INCOME_OPTIONS,
  RELATIONSHIP_OPTIONS,
} from "@/lib/constants/parent-options";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from "@/components/ui/sheet";
import { Field, FieldLabel } from "@/components/ui/field";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Users2 } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { StatCard } from "@/components/admin/stat-card";
import { StatsCardsRow } from "@/components/admin/stats-cards-row";
import { DeactivateConfirmDialog } from "@/components/admin/deactivate-confirm-dialog";
import { DataTableRowActions } from "@/components/ui/data-table-row-actions";
import { Plus, UserPlus, Users, PhoneCall, CheckCircle, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { formatDateShort } from "@/lib/format";
import { formatAgeFromDob } from "@/lib/admission/age";

// ------------------------------------------------------------------
// Sibling-detect edit-form banner (cycle 1.2)
// ------------------------------------------------------------------

function SiblingDetectBanner({
  detectedParent,
}: {
  detectedParent: {
    name: string;
    guardians: Array<{ student: { name: string } }>;
  } | null;
}) {
  if (!detectedParent) return null;
  const names = detectedParent.guardians
    .map((g) => g.student.name)
    .filter(Boolean)
    .join(", ");
  return (
    <Alert
      className="border-amber-300 bg-amber-50 text-amber-900"
      data-testid="admission-edit-sibling-banner"
    >
      <Users2 className="size-4" />
      <AlertDescription>
        Pendaftar ini terdeteksi sebagai saudara dari keluarga{" "}
        <strong>{detectedParent.name}</strong>
        {names ? ` (${names})` : ""}. Verifikasi sebelum mengonversi ke siswa.
      </AlertDescription>
    </Alert>
  );
}

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

type Admission = {
  id: string;
  childName: string;
  childAge: string | null; // legacy free-text; auto-derived from dateOfBirth on new rows
  dateOfBirth: string | null; // YYYY-MM-DD — source of truth for age display
  childGender: string | null;
  parentName: string;
  parentPhone: string | null;
  parentWhatsapp: string | null;
  parentEmail: string | null;
  parentEducation: string | null;
  parentOccupation: string | null;
  parentIncome: string | null;
  parentRelationship: string | null;
  programId: string | null;
  campusPreference: string | null;
  source: string;
  status: string;
  notes: string | null;
  followUpDate: string | null;
  studentId: string | null;
  createdAt: string;
  program: { name: string } | null;
  detectedParentId: string | null;
  detectedParent: {
    id: string;
    name: string;
    guardians: Array<{ student: { name: string } }>;
  } | null;
};

type Program = { id: string; name: string };

type Campus = { id: string; name: string };

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

const SOURCE_LABELS: Record<string, string> = {
  WHATSAPP: "WhatsApp",
  WALK_IN: "Datang Langsung",
  WEBSITE: "Website",
  REFERRAL: "Referensi",
  OTHER: "Lainnya",
};

// Happy-path transitions for the Admission state machine.
// Mirrors VALID_TRANSITIONS in `app/api/admissions/[id]/route.ts`.
// Terminal state CANCELLED has no next step. ADMITTED is terminal in the
// next-action surface (no entry below) but retains ADMITTED → CANCELLED via
// VALID_TRANSITIONS. ADMITTED-with-studentId hides via the row-action
// early-return (see actions column cell). Cycle 2026-05-12 dropped REGISTERED
// — converted vs not is encoded by `studentId`.
const NEXT_STATUS: Record<string, { status: string; label: string } | undefined> = {
  INQUIRY: { status: "VISIT_SCHEDULED", label: "Jadwalkan Kunjungan" },
  VISIT_SCHEDULED: { status: "VISITED", label: "Tandai Sudah Kunjungan" },
  VISITED: { status: "ADMITTED", label: "Terima" },
};

// Terminal states — hide "Batalkan" when already at one of these.
const TERMINAL_STATUSES = new Set(["CANCELLED"]);

// ------------------------------------------------------------------
// Form body (shared between Dialog on desktop and Sheet on mobile)
// ------------------------------------------------------------------

type AdmissionForm = {
  childName: string;
  dateOfBirth: string; // YYYY-MM-DD — age is auto-derived from this
  childGender: string;
  parentName: string;
  parentPhone: string;
  parentWhatsapp: string;
  parentEmail: string;
  parentEducation: string;
  parentOccupation: string;
  parentIncome: string;
  parentRelationship: string;
  programId: string;
  campusPreference: string;
  source: string;
  notes: string;
  followUpDate: string;
};

type AdmissionFormBodyProps = {
  form: AdmissionForm;
  setForm: React.Dispatch<React.SetStateAction<AdmissionForm>>;
  programs: Program[];
  campuses: Campus[];
};

function AdmissionFormBody({ form, setForm, programs, campuses }: AdmissionFormBodyProps) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field>
          <FieldLabel required>Nama Anak</FieldLabel>
          <Input
            value={form.childName}
            onChange={(e) => setForm({ ...form, childName: e.target.value })}
            placeholder="Aisyah"
          />
        </Field>
        <Field>
          <FieldLabel>Tanggal Lahir</FieldLabel>
          <Input
            type="date"
            value={form.dateOfBirth}
            onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
          />
          {form.dateOfBirth && (
            <span className="text-xs text-muted-foreground">
              Usia: {formatAgeFromDob(form.dateOfBirth) ?? "—"}
            </span>
          )}
        </Field>
      </div>
      <Field>
        <FieldLabel>Jenis Kelamin</FieldLabel>
        <Select
          value={form.childGender}
          onValueChange={(v) => v && setForm({ ...form, childGender: v })}
          items={{ L: "Laki-laki", P: "Perempuan" }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Pilih" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="L">Laki-laki</SelectItem>
            <SelectItem value="P">Perempuan</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field>
          <FieldLabel required>Nama Orang Tua</FieldLabel>
          <Input
            value={form.parentName}
            onChange={(e) => setForm({ ...form, parentName: e.target.value })}
            placeholder="Ibu Fatimah"
          />
        </Field>
        <Field>
          <FieldLabel>WhatsApp</FieldLabel>
          <Input
            value={form.parentWhatsapp}
            onChange={(e) => setForm({ ...form, parentWhatsapp: e.target.value })}
            placeholder="081234567890"
          />
        </Field>
      </div>
      <Field>
        <FieldLabel>Hubungan dengan Anak</FieldLabel>
        <Select
          value={form.parentRelationship}
          onValueChange={(v) => v && setForm({ ...form, parentRelationship: v })}
          items={Object.fromEntries(RELATIONSHIP_OPTIONS.map((o) => [o.value, o.label]))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Pilih" />
          </SelectTrigger>
          <SelectContent>
            {RELATIONSHIP_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <FieldLabel>Email</FieldLabel>
          <Input
            type="email"
            value={form.parentEmail}
            onChange={(e) => setForm({ ...form, parentEmail: e.target.value })}
            placeholder="email@contoh.com"
          />
        </Field>
        <Field>
          <FieldLabel>No. HP</FieldLabel>
          <Input
            value={form.parentPhone}
            onChange={(e) => setForm({ ...form, parentPhone: e.target.value })}
            placeholder="081234567890"
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field>
          <FieldLabel>Pendidikan Orang Tua</FieldLabel>
          <Select
            value={form.parentEducation}
            onValueChange={(v) => v && setForm({ ...form, parentEducation: v })}
            items={Object.fromEntries(EDUCATION_OPTIONS.map((o) => [o.value, o.label]))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Pilih" />
            </SelectTrigger>
            <SelectContent>
              {EDUCATION_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>Pekerjaan</FieldLabel>
          <Select
            value={form.parentOccupation}
            onValueChange={(v) => v && setForm({ ...form, parentOccupation: v })}
            items={Object.fromEntries(OCCUPATION_OPTIONS.map((o) => [o.value, o.label]))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Pilih" />
            </SelectTrigger>
            <SelectContent>
              {OCCUPATION_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>Penghasilan</FieldLabel>
          <Select
            value={form.parentIncome}
            onValueChange={(v) => v && setForm({ ...form, parentIncome: v })}
            items={Object.fromEntries(INCOME_OPTIONS.map((o) => [o.value, o.label]))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Pilih" />
            </SelectTrigger>
            <SelectContent>
              {INCOME_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <FieldLabel>Program Diminati</FieldLabel>
          <Select
            value={form.programId}
            onValueChange={(v) => v && setForm({ ...form, programId: v })}
            items={programs.map((p) => ({ label: p.name, value: p.id }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Pilih program" />
            </SelectTrigger>
            <SelectContent>
              {programs.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>Preferensi Kampus</FieldLabel>
          <Select
            value={form.campusPreference}
            onValueChange={(v) => v && setForm({ ...form, campusPreference: v })}
            items={campuses.map((c) => ({ label: c.name, value: c.id }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Pilih kampus" />
            </SelectTrigger>
            <SelectContent>
              {campuses.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field>
          <FieldLabel>Sumber</FieldLabel>
          <Select
            value={form.source}
            onValueChange={(v) => v && setForm({ ...form, source: v })}
            items={{
              WHATSAPP: "WhatsApp",
              WALK_IN: "Datang Langsung",
              WEBSITE: "Website",
              REFERRAL: "Referensi",
              OTHER: "Lainnya",
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
              <SelectItem value="WALK_IN">Datang Langsung</SelectItem>
              <SelectItem value="WEBSITE">Website</SelectItem>
              <SelectItem value="REFERRAL">Referensi</SelectItem>
              <SelectItem value="OTHER">Lainnya</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>Tanggal Follow Up</FieldLabel>
          <Input
            type="date"
            value={form.followUpDate}
            onChange={(e) => setForm({ ...form, followUpDate: e.target.value })}
          />
        </Field>
      </div>
      <Field>
        <FieldLabel>Catatan</FieldLabel>
        <Input
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder="Catatan tambahan..."
        />
      </Field>
    </>
  );
}

// ------------------------------------------------------------------
// Page (columns defined inside to access convertToStudent)
// ------------------------------------------------------------------

export default function AdmissionsPage() {
  const isMobile = useIsMobile();
  const [data, setData] = useState<Admission[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [stats, setStats] = useState({ total: 0, inquiry: 0, admitted: 0 });

  // FIND-011: stat-cards were a one-shot useEffect on mount, so creating /
  // converting / cancelling an admission left the KPI cards stale until the
  // admin reloaded. Extract into a callable so every mutation handler can
  // call it alongside `fetchAdmissions()`.
  const fetchStats = useCallback(() => {
    // Total Calon must include every status — previously summed only
    // INQUIRY + ADMITTED, so a Pertanyaan→Kunjungan transition silently
    // dropped the total by 1 (Finding F-3). Fetch an unfiltered count plus
    // the two visible buckets in parallel.
    Promise.all([
      fetch("/api/admissions?pageSize=1").then(r => r.json()),
      fetch("/api/admissions?pageSize=1&status=INQUIRY").then(r => r.json()),
      fetch("/api/admissions?pageSize=1&status=ADMITTED").then(r => r.json()),
    ]).then(([all, inquiry, admitted]) => {
      const t = all.pagination?.total ?? 0;
      const i = inquiry.pagination?.total ?? 0;
      const a = admitted.pagination?.total ?? 0;
      setStats({ total: t, inquiry: i, admitted: a });
    }).catch((err) => console.error("[admissions] stats fetch failed", err));
  }, []);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAdmission, setEditingAdmission] = useState<Admission | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Admission | null>(null);
  // T10: convert-confirm + email-conflict UI state.
  const [convertTarget, setConvertTarget] = useState<Admission | null>(null);
  const [emailConflict, setEmailConflict] = useState<{
    message: string;
    conflictingParentName: string | null;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    childName: "",
    dateOfBirth: "",
    childGender: "",
    parentName: "",
    parentPhone: "",
    parentWhatsapp: "",
    parentEmail: "",
    parentEducation: "",
    parentOccupation: "",
    parentIncome: "",
    parentRelationship: "",
    programId: "",
    campusPreference: "",
    source: "WHATSAPP",
    notes: "",
    followUpDate: "",
  });

  // Fetch programs + campuses once. Campuses cached for 1 h server-side
  // (revalidate=3600 in /api/config/campuses) so this is cheap on repeat opens.
  useEffect(() => {
    fetch("/api/programs")
      .then((r) => r.json())
      .then((p) => setPrograms(Array.isArray(p) ? p : p.data ?? []))
      .catch((err) => console.error("[admissions] programs fetch failed", err));
    fetch("/api/config/campuses")
      .then((r) => r.json())
      .then((c) => setCampuses(Array.isArray(c) ? c : []))
      .catch((err) => console.error("[admissions] campuses fetch failed", err));
  }, []);

  const fetchAdmissions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(pagination.page),
        pageSize: String(pagination.pageSize),
        sortBy,
        sortOrder,
      });
      if (search) params.set("search", search);
      if (statusFilter !== "all") params.set("status", statusFilter);

      const res = await fetch(`/api/admissions?${params}`);
      const json = await res.json();
      setData(json.data ?? []);
      if (json.pagination) setPagination(json.pagination);
    } catch {
      toast.error("Gagal memuat data pendaftaran");
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.pageSize, search, statusFilter, sortBy, sortOrder]);

  useEffect(() => {
    fetchAdmissions();
  }, [fetchAdmissions]);

  // ------------------------------------------------------------------
  // Handlers
  // ------------------------------------------------------------------

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setPagination((p) => ({ ...p, page: 1 }));
  }, []);

  const handlePageChange = useCallback((page: number) => {
    setPagination((p) => ({ ...p, page }));
  }, []);

  const handlePageSizeChange = useCallback((pageSize: number) => {
    setPagination((p) => ({ ...p, page: 1, pageSize }));
  }, []);

  const handleSortChange = useCallback((field: string, order: "asc" | "desc") => {
    setSortBy(field);
    setSortOrder(order);
    setPagination((p) => ({ ...p, page: 1 }));
  }, []);

  // T10: when an admission has a sibling-detect match, intercept Convert with
  // a confirmation dialog (state below). For admissions without detection the
  // direct path runs unchanged. The runConvert helper does the actual POST so
  // both call sites + the dialog confirm action route through one place.
  async function runConvert(admissionId: string, mergeWithDetected: boolean) {
    const res = await fetch(`/api/admissions/${admissionId}/convert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mergeWithDetected }),
    });
    if (res.ok) {
      toast.success(
        mergeWithDetected ? "Dikonversi menjadi siswa" : "Dikonversi tanpa menggabungkan",
      );
      setConvertTarget(null);
      setEmailConflict(null);
      fetchAdmissions();
      fetchStats();
      return;
    }
    if (res.status === 409) {
      const d = (await res.json().catch(() => ({}))) as {
        error?: string;
        conflictingParentName?: string;
        message?: string;
      };
      if (d.error === "EMAIL_CONFLICT") {
        setEmailConflict({
          message:
            d.message ??
            "Email orang tua sudah terdaftar. Pilih Gabungkan atau hapus email pendaftaran.",
          conflictingParentName: d.conflictingParentName ?? null,
        });
        return;
      }
    }
    const d = await res.json().catch(() => ({}));
    toast.error(d.error || "Gagal konversi");
  }

  function convertToStudent(a: Admission) {
    if (a.detectedParentId) {
      setConvertTarget(a);
      setEmailConflict(null);
      return;
    }
    // No detection → preserve the pre-T10 one-click behaviour (auto-merge).
    void runConvert(a.id, true);
  }

  async function handleSubmit() {
    if (!form.childName.trim() || !form.parentName.trim()) {
      toast.error("Nama anak dan orang tua wajib diisi");
      return;
    }
    setSaving(true);
    const url = editingAdmission ? `/api/admissions/${editingAdmission.id}` : "/api/admissions";
    const method = editingAdmission ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      toast.success(editingAdmission ? "Data diperbarui" : "Pendaftaran tercatat");
      setDialogOpen(false);
      setEditingAdmission(null);
      fetchAdmissions(); fetchStats();
    } else {
      const d = await res.json();
      toast.error(d.error || "Gagal");
    }
    setSaving(false);
  }

  async function advanceStatus(a: Admission) {
    const next = NEXT_STATUS[a.status];
    if (!next) return;
    const res = await fetch(`/api/admissions/${a.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next.status }),
    });
    if (res.ok) {
      toast.success(`Status diubah ke ${next.label}`);
      fetchAdmissions(); fetchStats();
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error || "Gagal mengubah status");
    }
  }

  async function handleCancel() {
    if (!cancelTarget) return;
    const res = await fetch(`/api/admissions/${cancelTarget.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "CANCELLED" }),
    });
    if (res.ok) { toast.success("Pendaftaran dibatalkan"); setCancelTarget(null); fetchAdmissions(); fetchStats(); }
    else toast.error("Gagal membatalkan");
  }

  function openDialog() {
    setEditingAdmission(null);
    setForm({
      childName: "",
      dateOfBirth: "",
      childGender: "",
      parentName: "",
      parentPhone: "",
      parentWhatsapp: "",
      parentEmail: "",
      parentEducation: "",
      parentOccupation: "",
      parentIncome: "",
      parentRelationship: "",
      programId: "",
      campusPreference: "",
      source: "WHATSAPP",
      notes: "",
      followUpDate: "",
    });
    setDialogOpen(true);
  }

  // ------------------------------------------------------------------
  // Columns (need access to convertToStudent)
  // ------------------------------------------------------------------

  const columns: ColumnDef<Admission>[] = [
    {
      accessorKey: "childName",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Anak" />
      ),
      cell: ({ row }) => {
        const a = row.original;
        return (
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{a.childName}</span>
              {(() => {
                // Prefer derived age from dateOfBirth (new rows); fall back to
                // the legacy childAge free-text column for rows created before
                // the DOB-only switch (cycle 2026-05-11).
                const derived = formatAgeFromDob(a.dateOfBirth);
                const display = derived ?? a.childAge;
                return display ? (
                  <span className="text-xs text-muted-foreground">{display}</span>
                ) : null;
              })()}
            </div>
            <p className="text-xs text-muted-foreground">
              {a.parentName}
              {a.parentPhone && ` · ${a.parentPhone}`}
            </p>
          </div>
        );
      },
    },
    {
      id: "program",
      header: "Program",
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.program?.name ?? (
            <span className="text-muted-foreground italic">Belum dipilih</span>
          )}
        </span>
      ),
    },
    {
      id: "source",
      header: "Sumber",
      cell: ({ row }) => (
        <div className="text-xs">
          <span>{SOURCE_LABELS[row.original.source] ?? row.original.source}</span>
          <p className="text-muted-foreground">
            {formatDateShort(row.original.createdAt.split("T")[0])}
          </p>
        </div>
      ),
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Tanggal" />
      ),
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {formatDateShort(row.original.createdAt.split("T")[0])}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ row }) => {
        const a = row.original;
        if (a.status === "ADMITTED" && a.studentId) {
          return <Badge variant="secondary" className="bg-primary/10 text-primary">Terdaftar</Badge>;
        }
        return <StatusBadge status={a.status} />;
      },
    },
    {
      id: "sibling",
      header: "Saudara",
      cell: ({ row }) => {
        const dp = row.original.detectedParent;
        if (!dp) return <span className="text-xs text-muted-foreground">—</span>;
        const studentNames = dp.guardians
          .map((g) => g.student.name)
          .filter((n): n is string => Boolean(n));
        return (
          <HoverCard>
            <HoverCardTrigger
              render={
                <Badge
                  variant="secondary"
                  className="cursor-help gap-1"
                  data-testid="admission-row-sibling-chip"
                >
                  <Users2 size={12} />
                  Saudara terdeteksi
                </Badge>
              }
            />

            <HoverCardContent className="w-64 text-sm" side="left">
              <p className="font-semibold">{dp.name}</p>
              {studentNames.length > 0 ? (
                <ul className="mt-1 list-disc pl-4 text-muted-foreground">
                  {studentNames.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-muted-foreground italic">
                  Tidak ada siswa tertaut
                </p>
              )}
            </HoverCardContent>
          </HoverCard>
        );
      },
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const a = row.original;
        if (a.studentId) {
          return <span className="text-xs text-muted-foreground">Sudah jadi siswa</span>;
        }
        const next = NEXT_STATUS[a.status];
        const extras: { label: string; icon?: React.ReactNode; onClick: () => void }[] = [];
        if (next) {
          extras.push({
            label: `Lanjutkan ke ${next.label}`,
            icon: <ArrowRight size={14} />,
            onClick: () => advanceStatus(a),
          });
        }
        if (!TERMINAL_STATUSES.has(a.status)) {
          extras.push({
            label: "Konversi ke Siswa",
            icon: <UserPlus size={14} />,
            onClick: () => convertToStudent(a),
          });
        }
        return (
          <DataTableRowActions
            onEdit={() => {
              setEditingAdmission(a);
              setForm({
                childName: a.childName, dateOfBirth: a.dateOfBirth ?? "", childGender: a.childGender ?? "",
                parentName: a.parentName, parentPhone: a.parentPhone ?? "", parentWhatsapp: a.parentWhatsapp ?? "",
                parentEmail: a.parentEmail ?? "", parentEducation: a.parentEducation ?? "",
                parentOccupation: a.parentOccupation ?? "",
                parentIncome: a.parentIncome ?? "",
                parentRelationship: a.parentRelationship ?? "",
                programId: a.programId ?? "",
                campusPreference: a.campusPreference ?? "",
                source: a.source, notes: a.notes ?? "", followUpDate: a.followUpDate ?? "",
              });
              setDialogOpen(true);
            }}
            onCancel={!TERMINAL_STATUSES.has(a.status) ? () => setCancelTarget(a) : undefined}
            extraActions={extras.length ? extras : undefined}
          />
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="Pendaftaran"
        description={`${pagination.total} calon siswa`}
        actions={
          <Button size="sm" onClick={openDialog}>
            <Plus size={14} className="mr-1.5" /> Catat Pertanyaan
          </Button>
        }
      />

      <StatsCardsRow cols={4}>
        <StatCard label="Total Calon" value={stats.total} icon={Users} color="primary" index={0} />
        <StatCard label="Pertanyaan" value={stats.inquiry} icon={PhoneCall} color="warning" index={1} />
        <StatCard label="Diterima" value={stats.admitted} icon={CheckCircle} color="success" index={2} />
      </StatsCardsRow>

      <DataTableToolbar
        searchPlaceholder="Cari nama anak atau orang tua..."
        onSearchChange={handleSearchChange}
        filters={[
          {
            key: "status",
            label: "Status",
            value: statusFilter,
            onChange: (v) => {
              setStatusFilter(v);
              setPagination((p) => ({ ...p, page: 1 }));
            },
            options: [
              { value: "all", label: "Semua Status" },
              { value: "INQUIRY", label: "Pertanyaan" },
              { value: "VISIT_SCHEDULED", label: "Kunjungan" },
              { value: "VISITED", label: "Sudah Kunjungan" },
              { value: "ADMITTED", label: "Diterima" },
              { value: "CANCELLED", label: "Dibatalkan" },
            ],
          },
        ]}
      />

      <DataTable
        columns={columns}
        data={data}
        pagination={pagination}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
        onSortChange={handleSortChange}
        defaultSort={{ field: "createdAt", order: "desc" }}
        loading={loading}
        emptyTitle="Tidak ada pendaftaran"
        emptyDescription="Catat pertanyaan baru ketika orang tua menghubungi sekolah"
      />

      {/* Add/Edit Admission — Sheet on mobile (bottom, form is narrow when grids collapse), Dialog on desktop */}
      {isMobile ? (
        <Sheet open={dialogOpen} onOpenChange={setDialogOpen}>
          <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>{editingAdmission ? "Edit Pendaftaran" : "Catat Pertanyaan Baru"}</SheetTitle>
            </SheetHeader>
            <div className="p-card space-y-field">
              {editingAdmission?.detectedParent && (
                <SiblingDetectBanner detectedParent={editingAdmission.detectedParent} />
              )}
              <AdmissionFormBody form={form} setForm={setForm} programs={programs} campuses={campuses} />
              <div className="flex flex-col-reverse gap-2 pt-2">
                <Button onClick={handleSubmit} disabled={saving}>
                  {saving ? "Menyimpan..." : editingAdmission ? "Simpan Perubahan" : "Catat Pertanyaan"}
                </Button>
                <SheetClose render={<Button variant="ghost">Batal</Button>} />
              </div>
            </div>
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="p-card sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingAdmission ? "Edit Pendaftaran" : "Catat Pertanyaan Baru"}</DialogTitle>
            </DialogHeader>
            <div className="p-card space-y-field">
              {editingAdmission?.detectedParent && (
                <SiblingDetectBanner detectedParent={editingAdmission.detectedParent} />
              )}
              <AdmissionFormBody form={form} setForm={setForm} programs={programs} campuses={campuses} />
            </div>
            <DialogFooter>
              <DialogClose>
                <Button variant="ghost">Batal</Button>
              </DialogClose>
              <Button onClick={handleSubmit} disabled={saving}>
                {saving ? "Menyimpan..." : editingAdmission ? "Simpan Perubahan" : "Catat Pertanyaan"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <DeactivateConfirmDialog
        open={!!cancelTarget}
        onOpenChange={(o) => !o && setCancelTarget(null)}
        entityName={cancelTarget ? `pendaftaran ${cancelTarget.childName}` : ""}
        action="cancel"
        onConfirm={handleCancel}
      />

      {/* T10: sibling-detect confirmation dialog — only opens when admission
          has detectedParentId. Three actions: Merge (default, link to existing
          parent), Convert without merging (new Parent), Cancel. Email-conflict
          on no-merge surfaces inline via emailConflict state. */}
      <Dialog
        open={!!convertTarget}
        onOpenChange={(o) => {
          if (!o) {
            setConvertTarget(null);
            setEmailConflict(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Konversi ke Siswa</DialogTitle>
          </DialogHeader>
          {convertTarget && (
            <div className="space-y-4">
              <p className="text-sm">
                Pendaftar <strong>{convertTarget.childName}</strong> terdeteksi sebagai saudara dari keluarga{" "}
                <strong>{convertTarget.detectedParent?.name ?? "(tidak diketahui)"}</strong>.
              </p>
              {convertTarget.detectedParent?.guardians?.length ? (
                <div className="rounded-lg border bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground mb-1">Anak terdaftar di keluarga ini:</p>
                  <ul className="text-sm list-disc pl-5">
                    {convertTarget.detectedParent.guardians.map((g, i) => (
                      <li key={i}>{g.student.name}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {emailConflict && (
                <Alert className="border-destructive/40 bg-destructive/10 text-destructive">
                  <AlertDescription>
                    {emailConflict.message}
                    {emailConflict.conflictingParentName ? ` (Parent: ${emailConflict.conflictingParentName})` : ""}
                  </AlertDescription>
                </Alert>
              )}
              <p className="text-xs text-muted-foreground">
                <strong>Gabungkan</strong>: tautkan siswa baru ke wali yang sudah ada (rekomendasi).<br />
                <strong>Konversi tanpa gabung</strong>: buat wali baru terpisah meski email cocok.
              </p>
            </div>
          )}
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <DialogClose>
              <Button variant="ghost">Batal</Button>
            </DialogClose>
            <Button
              variant="outline"
              onClick={() => convertTarget && void runConvert(convertTarget.id, false)}
            >
              Konversi tanpa gabung
            </Button>
            <Button
              onClick={() => convertTarget && void runConvert(convertTarget.id, true)}
            >
              Gabungkan dengan wali
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
