"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ColumnDef } from "@tanstack/react-table";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  UserMinus,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/admin/page-header";
import { StatCard } from "@/components/admin/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ResponsiveFormDialog } from "@/components/ui/responsive-form-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, healthTone } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";

// ── Types ────────────────────────────────────────────────────────

type SlotTemplate = "FULL_DAY" | "MORNING_AND_AFTERNOON";

type TeachingRole = "HOMEROOM" | "ASSISTANT";

type ClassDetail = {
  id: string;
  name: string;
  capacity: number;
  slotTemplate: SlotTemplate;
  status: "ACTIVE" | "INACTIVE";
  campusId: string;
  programId: string;
  academicYearId: string;
  classTrackId: string;
  campus: { id: string; name: string };
  program: { id: string; code: string; name: string };
  academicYear: {
    id: string;
    name: string;
    status: "PLANNING" | "ACTIVE" | "ARCHIVED";
  };
  classTrack: { id: string; name: string; status: string };
  enrollments: {
    id: string;
    enrollDate: string;
    status: string;
    student: { id: string; name: string; nis: string | null };
  }[];
  teachingAssignments: {
    id: string;
    role: TeachingRole;
    createdAt: string;
    employee: { id: string; nama: string; formalName: string | null };
  }[];
  enrolledCount: number;
};

type SessionRow = {
  id: string;
  classSectionId: string;
  semesterId: string;
  date: string;
  slot: string;
  teacherId: string | null;
  defaultTeacherId: string | null;
  substituteReason: string | null;
  isBackfilled: boolean;
  teacher: { id: string; nama: string } | null;
  defaultTeacher: { id: string; nama: string } | null;
};

type Employee = { id: string; nama: string; formalName?: string | null };

type StudentOption = {
  id: string;
  name: string;
  nis: string | null;
  status: string;
};

type HealthBadge = "Sehat" | "Perhatian" | "Kritis" | "Tidak Aktif" | "Libur";

// ── Constants ────────────────────────────────────────────────────

const SLOT_LABELS: Record<string, string> = {
  FULL_DAY: "Sehari Penuh",
  MORNING: "Pagi",
  AFTERNOON: "Siang",
};

const ROLE_LABEL: Record<TeachingRole, string> = {
  HOMEROOM: "Wali Kelas",
  ASSISTANT: "Asisten",
};

const DAY_NAMES = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

// Health-badge tone now comes from the shared `healthTone()` helper in
// components/ui/status-badge.ts (single source for both list + detail pages).

// ── Helpers ──────────────────────────────────────────────────────

function ymd(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  // The API surfaces dates as YYYY-MM-DD strings; format to YYYY-MM-DD literally
  // (spec calls for that exact shape on roster + teacher rows).
  return value.slice(0, 10);
}

// ── Component ────────────────────────────────────────────────────

export function ClassDetailClient({
  classId,
  canWrite,
}: {
  classId: string;
  canWrite: boolean;
}) {
  // Detail data is the source of truth for header + roster + teachers.
  const [data, setData] = useState<ClassDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    capacity: 20,
    slotTemplate: "FULL_DAY" as SlotTemplate,
  });
  const [savingEdit, setSavingEdit] = useState(false);

  // Deactivate / reactivate confirms
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [reactivateOpen, setReactivateOpen] = useState(false);

  // Add-student dialog
  const [addStudentOpen, setAddStudentOpen] = useState(false);
  const [studentOptions, setStudentOptions] = useState<StudentOption[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [addingStudent, setAddingStudent] = useState(false);

  // Remove-student confirm
  const [removeStudentTarget, setRemoveStudentTarget] = useState<
    ClassDetail["enrollments"][number] | null
  >(null);

  // Add-teacher dialog
  const [addTeacherOpen, setAddTeacherOpen] = useState(false);
  const [employeeOptions, setEmployeeOptions] = useState<Employee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<TeachingRole>("HOMEROOM");
  const [addingTeacher, setAddingTeacher] = useState(false);

  // Homeroom-replace confirm — appears on top of the Add Teacher dialog after
  // the API returns 409 HOMEROOM_EXISTS.
  const [replaceHomeroom, setReplaceHomeroom] = useState<{
    existingAssignmentId: string;
    existingEmployeeId: string;
    existingEmployeeName: string;
    newEmployeeId: string;
    newEmployeeName: string;
  } | null>(null);

  // Remove-teacher confirm
  const [removeTeacherTarget, setRemoveTeacherTarget] = useState<
    ClassDetail["teachingAssignments"][number] | null
  >(null);

  // ── Calendar state (relocated from class-sections detail) ───────
  const now = useMemo(() => new Date(), []);
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState(false);
  const [employeesTruncated, setEmployeesTruncated] = useState(false);
  const [selectedSession, setSelectedSession] = useState<SessionRow | null>(
    null,
  );
  const [swapTeacherId, setSwapTeacherId] = useState<string>("");
  const [swapReason, setSwapReason] = useState("");
  const [savingSwap, setSavingSwap] = useState(false);

  // ── Derived flags ───────────────────────────────────────────────
  const archived = data?.academicYear.status === "ARCHIVED";
  const writeAllowed = canWrite && !archived;
  const homeroomAssignment =
    data?.teachingAssignments.find((a) => a.role === "HOMEROOM") ?? null;
  const enrolledCount = data?.enrollments.length ?? 0;

  // Health metric inputs — `attendance7dPct` + `todaySession` are not exposed
  // by the detail GET this cycle (list page enrichment lives on the index
  // route). Wires up when the detail endpoint adds health enrichment in a
  // follow-up. For now we render dashes for the kehadiran + sesi cards and
  // skip the Kondisi badge entirely (falls back to StatusBadge). Typed as the
  // wide unions so the JSX branches are reachable when the placeholder lifts.
  const attendance7dPct = null as number | null;
  const todaySession = null as "Held" | "Missing" | "Holiday" | null;

  // ── Detail fetch ────────────────────────────────────────────────
  const fetchDetail = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/classes/${classId}`);
      if (!res.ok) {
        setLoadError(true);
        setData(null);
        return;
      }
      const json = (await res.json()) as ClassDetail;
      setData(json);
      setLoadError(false);
    } catch {
      setLoadError(true);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  // ── Calendar fetch ──────────────────────────────────────────────
  const fetchSessions = useCallback(() => {
    setSessionsLoading(true);
    setSessionsError(false);
    const m = `${year}-${String(month).padStart(2, "0")}`;
    fetch(`/api/admin/class-sessions?classSectionId=${classId}&month=${m}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((rows: SessionRow[]) => {
        setSessions(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        setSessions([]);
        setSessionsError(true);
      })
      .finally(() => setSessionsLoading(false));
  }, [classId, month, year]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // ── Employees fetch (for swap drawer + add-teacher dialog) ──────
  useEffect(() => {
    if (!canWrite) return;
    fetch("/api/employees?status=ACTIVE&pageSize=100")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((json) => {
        const list: Employee[] = Array.isArray(json) ? json : json?.data ?? [];
        const total = Array.isArray(json)
          ? list.length
          : json?.total ?? list.length;
        setEmployeeOptions(
          list.map((e) => ({
            id: e.id,
            nama: e.nama,
            formalName: e.formalName ?? null,
          })),
        );
        setEmployeesTruncated(total > list.length);
      })
      .catch(() => {
        setEmployeeOptions([]);
        setEmployeesTruncated(false);
        toast.error("Gagal memuat daftar guru");
      });
  }, [canWrite]);

  // ── Students fetch (lazy on add-student dialog open) ────────────
  async function loadStudentOptions() {
    try {
      // `/api/students` caps pageSize at 100. For preschool tenants this is
      // adequate; the picker filters client-side against the current
      // enrollments. If a tenant has >100 ACTIVE students, the dialog will
      // surface a truncation hint (parallel to the swap drawer).
      const res = await fetch("/api/students?status=ACTIVE&pageSize=100");
      if (!res.ok) {
        toast.error("Gagal memuat daftar siswa");
        return;
      }
      const json = await res.json();
      const list: StudentOption[] = Array.isArray(json)
        ? json
        : json?.data ?? [];
      const enrolledIds = new Set(
        data?.enrollments.map((e) => e.student.id) ?? [],
      );
      setStudentOptions(list.filter((s) => !enrolledIds.has(s.id)));
    } catch {
      toast.error("Gagal memuat daftar siswa");
    }
  }

  // ── Header actions ──────────────────────────────────────────────
  function openEdit() {
    if (!data) return;
    setEditForm({
      name: data.name,
      capacity: data.capacity,
      slotTemplate: data.slotTemplate,
    });
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!data) return;
    if (!editForm.name.trim()) {
      toast.error("Nama kelas wajib diisi");
      return;
    }
    if (editForm.capacity < 1 || editForm.capacity > 200) {
      toast.error("Kapasitas harus antara 1 dan 200");
      return;
    }
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/admin/classes/${classId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name.trim(),
          capacity: editForm.capacity,
          slotTemplate: editForm.slotTemplate,
        }),
      });
      if (res.ok) {
        toast.success("Kelas diperbarui");
        setEditOpen(false);
        fetchDetail();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error ?? "Gagal menyimpan");
      }
    } finally {
      setSavingEdit(false);
    }
  }

  async function flipStatus(target: "ACTIVE" | "INACTIVE") {
    if (!data) return;
    const res =
      target === "INACTIVE"
        ? await fetch(`/api/admin/classes/${classId}`, { method: "DELETE" })
        : await fetch(`/api/admin/classes/${classId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "ACTIVE" }),
          });
    if (res.ok) {
      toast.success(
        target === "ACTIVE" ? "Kelas diaktifkan" : "Kelas dinonaktifkan",
      );
      fetchDetail();
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error ?? "Gagal");
    }
  }

  // ── Roster mutations ────────────────────────────────────────────
  function openAddStudent() {
    setSelectedStudentId("");
    setAddStudentOpen(true);
    loadStudentOptions();
  }

  async function submitAddStudent() {
    if (!selectedStudentId) {
      toast.error("Pilih siswa");
      return;
    }
    setAddingStudent(true);
    try {
      const res = await fetch(
        `/api/admin/classes/${classId}/enrollments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ studentId: selectedStudentId }),
        },
      );
      if (res.ok) {
        toast.success("Siswa ditambahkan");
        setAddStudentOpen(false);
        fetchDetail();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error ?? "Gagal menambahkan siswa");
      }
    } finally {
      setAddingStudent(false);
    }
  }

  async function removeStudent() {
    if (!removeStudentTarget) return;
    const studentId = removeStudentTarget.student.id;
    const res = await fetch(
      `/api/admin/classes/${classId}/enrollments?studentId=${studentId}`,
      { method: "DELETE" },
    );
    if (res.ok) {
      toast.success("Siswa dikeluarkan");
      setRemoveStudentTarget(null);
      fetchDetail();
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error ?? "Gagal mengeluarkan siswa");
    }
  }

  // ── Teaching-assignment mutations ───────────────────────────────
  function openAddTeacher() {
    setSelectedEmployeeId("");
    setSelectedRole("HOMEROOM");
    setAddTeacherOpen(true);
  }

  async function submitAddTeacher() {
    if (!selectedEmployeeId) {
      toast.error("Pilih guru");
      return;
    }
    setAddingTeacher(true);
    try {
      const res = await fetch(
        `/api/admin/classes/${classId}/teaching-assignments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            employeeId: selectedEmployeeId,
            role: selectedRole,
          }),
        },
      );
      if (res.ok) {
        toast.success("Guru ditambahkan");
        setAddTeacherOpen(false);
        fetchDetail();
        return;
      }
      const d = await res.json().catch(() => ({}));
      if (
        res.status === 409 &&
        d?.code === "HOMEROOM_EXISTS" &&
        d?.existingEmployeeId
      ) {
        const newEmployeeName =
          employeeOptions.find((e) => e.id === selectedEmployeeId)?.nama ??
          "guru ini";
        setReplaceHomeroom({
          existingAssignmentId: d.existingAssignmentId,
          existingEmployeeId: d.existingEmployeeId,
          existingEmployeeName: d.existingEmployeeName,
          newEmployeeId: selectedEmployeeId,
          newEmployeeName,
        });
        return;
      }
      toast.error(d.error ?? "Gagal menambahkan guru");
    } finally {
      setAddingTeacher(false);
    }
  }

  async function confirmReplaceHomeroom() {
    if (!replaceHomeroom) return;
    setAddingTeacher(true);
    try {
      const delRes = await fetch(
        `/api/admin/classes/${classId}/teaching-assignments?employeeId=${replaceHomeroom.existingEmployeeId}`,
        { method: "DELETE" },
      );
      if (!delRes.ok) {
        const d = await delRes.json().catch(() => ({}));
        toast.error(d.error ?? "Gagal mengganti wali kelas");
        return;
      }
      const postRes = await fetch(
        `/api/admin/classes/${classId}/teaching-assignments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            employeeId: replaceHomeroom.newEmployeeId,
            role: "HOMEROOM",
          }),
        },
      );
      if (postRes.ok) {
        toast.success("Wali kelas diganti");
        setReplaceHomeroom(null);
        setAddTeacherOpen(false);
        fetchDetail();
      } else {
        const d = await postRes.json().catch(() => ({}));
        toast.error(d.error ?? "Gagal menambahkan wali kelas baru");
      }
    } finally {
      setAddingTeacher(false);
    }
  }

  async function removeTeacher() {
    if (!removeTeacherTarget) return;
    const employeeId = removeTeacherTarget.employee.id;
    const res = await fetch(
      `/api/admin/classes/${classId}/teaching-assignments?employeeId=${employeeId}`,
      { method: "DELETE" },
    );
    if (res.ok) {
      toast.success("Guru dihapus dari kelas");
      setRemoveTeacherTarget(null);
      fetchDetail();
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error ?? "Gagal menghapus guru");
    }
  }

  // ── Calendar handlers (verbatim from class-sections client) ─────
  const sessionsByDate = useMemo(() => {
    const map = new Map<string, SessionRow[]>();
    for (const s of sessions) {
      const arr = map.get(s.date) ?? [];
      arr.push(s);
      map.set(s.date, arr);
    }
    return map;
  }, [sessions]);

  function prevMonth() {
    if (month === 1) {
      setMonth(12);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  }
  function nextMonth() {
    if (month === 12) {
      setMonth(1);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  }

  const monthLabel = new Date(year, month - 1).toLocaleDateString("id-ID", {
    month: "long",
    year: "numeric",
  });

  const firstDow = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  function openSession(s: SessionRow) {
    setSelectedSession(s);
    setSwapTeacherId(s.teacherId ?? "");
    setSwapReason(s.substituteReason ?? "");
  }

  function closeSwap() {
    setSelectedSession(null);
    setSwapTeacherId("");
    setSwapReason("");
  }

  async function submitSwap(teacherId: string | null, reason: string) {
    if (!selectedSession) return;
    setSavingSwap(true);
    try {
      const res = await fetch(
        `/api/admin/class-sessions/${selectedSession.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            teacherId,
            substituteReason: reason.trim() || undefined,
          }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        toast.error(err?.error ?? "Gagal menyimpan perubahan guru");
        return;
      }
      toast.success("Guru sesi diperbarui");
      closeSwap();
      fetchSessions();
    } catch {
      toast.error("Gagal menyimpan perubahan guru");
    } finally {
      setSavingSwap(false);
    }
  }

  // ── Roster table columns ────────────────────────────────────────
  const rosterColumns: ColumnDef<ClassDetail["enrollments"][number]>[] =
    useMemo(
      () => [
        {
          id: "student",
          accessorFn: (r) => r.student.name,
          header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Nama" />
          ),
          cell: ({ row }) => (
            <Link
              href={`/admin/students/${row.original.student.id}`}
              className="text-sm font-medium hover:underline"
            >
              {row.original.student.name}
            </Link>
          ),
        },
        {
          id: "nis",
          accessorFn: (r) => r.student.nis ?? "",
          header: ({ column }) => (
            <DataTableColumnHeader column={column} title="NIS" />
          ),
          cell: ({ row }) =>
            row.original.student.nis ? (
              <span className="font-currency text-sm">
                {row.original.student.nis}
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">—</span>
            ),
        },
        {
          accessorKey: "status",
          header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Status" />
          ),
          cell: ({ row }) => <StatusBadge status={row.original.status} />,
        },
        {
          id: "enrollDate",
          accessorFn: (r) => r.enrollDate,
          header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Tgl Masuk" />
          ),
          cell: ({ row }) => (
            <span className="text-sm text-muted-foreground">
              {formatDate(row.original.enrollDate)}
            </span>
          ),
        },
        {
          id: "actions",
          cell: ({ row }) => (
            <div className="flex items-center justify-end">
              {writeAllowed && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2 text-destructive hover:text-destructive"
                  onClick={() => setRemoveStudentTarget(row.original)}
                >
                  <UserMinus size={14} className="mr-1" />
                  <span className="text-xs">Keluarkan</span>
                </Button>
              )}
            </div>
          ),
        },
      ],
      [writeAllowed],
    );

  // ── Teacher table columns ───────────────────────────────────────
  const teacherColumns: ColumnDef<ClassDetail["teachingAssignments"][number]>[] =
    useMemo(
      () => [
        {
          id: "name",
          accessorFn: (r) => r.employee.nama,
          header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Nama" />
          ),
          cell: ({ row }) => (
            <span className="text-sm font-medium">
              {row.original.employee.nama}
            </span>
          ),
        },
        {
          id: "role",
          accessorFn: (r) => r.role,
          header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Peran" />
          ),
          cell: ({ row }) => (
            <Badge variant="outline" className="text-xs">
              {ROLE_LABEL[row.original.role]}
            </Badge>
          ),
        },
        {
          id: "createdAt",
          accessorFn: (r) => r.createdAt,
          header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Tgl Ditugaskan" />
          ),
          cell: ({ row }) => (
            <span className="text-sm text-muted-foreground">
              {formatDate(row.original.createdAt)}
            </span>
          ),
        },
        {
          id: "actions",
          cell: ({ row }) => (
            <div className="flex items-center justify-end">
              {writeAllowed && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2 text-destructive hover:text-destructive"
                  onClick={() => setRemoveTeacherTarget(row.original)}
                >
                  <Trash2 size={14} className="mr-1" />
                  <span className="text-xs">Hapus</span>
                </Button>
              )}
            </div>
          ),
        },
      ],
      [writeAllowed],
    );

  // ── Render guards ───────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-section">
        <Skeleton className="h-16 w-full max-w-lg" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-card">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (loadError || !data) {
    return (
      <PageHeader
        title="Kelas tidak ditemukan"
        description="Kelas tidak ada atau Anda tidak memiliki akses."
      />
    );
  }

  const homeroomLabel = homeroomAssignment
    ? ` · Wali Kelas: ${homeroomAssignment.employee.nama}`
    : "";

  // Section labels for today's session card
  const sesiHariIniLabel =
    todaySession === "Held"
      ? "Berlangsung"
      : todaySession === "Missing"
        ? "Belum dibuat"
        : todaySession === "Holiday"
          ? "Libur"
          : "—";

  // Compute the health badge only when all inputs are available — per spec,
  // we fall back to no badge (rendered as StatusBadge instead) until the
  // detail GET surfaces enrichment.
  const healthBadge = null as HealthBadge | null;

  return (
    <div className="space-y-section">
      {/* ── Section A — Page header ─────────────────────────────── */}
      <PageHeader
        title={`${data.name} · ${data.academicYear.name}`}
        description={`${data.campus.name} · ${data.program.name}${homeroomLabel}`}
        actions={
          writeAllowed ? (
            <>
              <Button variant="outline" onClick={openEdit}>
                Ubah
              </Button>
              {data.status === "ACTIVE" ? (
                <Button
                  variant="outline"
                  onClick={() => setDeactivateOpen(true)}
                  className="text-destructive hover:text-destructive"
                >
                  Nonaktifkan
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => setReactivateOpen(true)}
                >
                  Aktifkan
                </Button>
              )}
            </>
          ) : undefined
        }
      />

      {archived && (
        <div className="rounded-md border border-status-leave bg-status-leave-subtle px-4 py-3 text-sm text-status-leave-text">
          Tahun ajaran ini sudah diarsipkan. Tampilan hanya baca.
        </div>
      )}

      {/* ── Section B — Ringkasan ───────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-card">
        <StatCard
          label="Roster"
          value={`${enrolledCount}/${data.capacity}`}
          icon={Users}
          color="primary"
          index={0}
        />
        <StatCard
          label="Kehadiran 7 hari"
          value={
            attendance7dPct !== null ? `${attendance7dPct.toFixed(0)}%` : "—"
          }
          icon={CheckCircle2}
          color="success"
          index={1}
        />
        <StatCard
          label="Sesi hari ini"
          value={sesiHariIniLabel}
          icon={CalendarDays}
          color="primary"
          index={2}
        />
      </div>

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>Kondisi kelas:</span>
        {healthBadge ? (
          <Badge variant="outline" className={healthTone(healthBadge)}>
            {healthBadge}
          </Badge>
        ) : (
          <StatusBadge status={data.status} />
        )}
      </div>

      {/* ── Section C — Siswa ───────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <CardTitle>Daftar Siswa</CardTitle>
            <CardDescription>
              {enrolledCount} siswa aktif dari kapasitas {data.capacity}.
            </CardDescription>
          </div>
          {writeAllowed && (
            <Button size="sm" onClick={openAddStudent} className="gap-2">
              <Plus size={14} /> Tambah Siswa
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <DataTable
            columns={rosterColumns}
            data={data.enrollments}
            emptyTitle="Belum ada siswa terdaftar di kelas ini."
            emptyDescription=" "
          />
        </CardContent>
      </Card>

      {/* ── Section D — Guru Pengajar ───────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <CardTitle>Guru Pengajar</CardTitle>
            <CardDescription>Wali kelas + asisten.</CardDescription>
          </div>
          {writeAllowed && (
            <Button size="sm" onClick={openAddTeacher} className="gap-2">
              <Plus size={14} /> Tambah Guru Pengajar
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <DataTable
            columns={teacherColumns}
            data={data.teachingAssignments}
            emptyTitle="Belum ada guru ditugaskan."
            emptyDescription=" "
          />
        </CardContent>
      </Card>

      {/* ── Section E — Kalender Sesi (relocated verbatim) ──────── */}
      <Card>
        <CardHeader>
          <CardTitle>Kalender Sesi</CardTitle>
          <CardDescription>
            Klik sesi untuk mengubah guru pengganti.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex items-center justify-between">
            <button
              onClick={prevMonth}
              aria-label="Bulan sebelumnya"
              className="rounded-lg p-2 text-muted-foreground hover:bg-accent"
            >
              <ChevronLeft size={18} />
            </button>
            <h2 className="text-sm font-semibold capitalize">{monthLabel}</h2>
            <button
              onClick={nextMonth}
              aria-label="Bulan berikutnya"
              className="rounded-lg p-2 text-muted-foreground hover:bg-accent"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7 gap-1">
            {DAY_NAMES.map((d) => (
              <div
                key={d}
                className="py-1 text-center text-xs font-semibold text-muted-foreground"
              >
                {d}
              </div>
            ))}
          </div>

          {sessionsLoading ? (
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 35 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square rounded-lg" />
              ))}
            </div>
          ) : sessionsError ? (
            <div className="py-12 text-center">
              <p className="text-sm text-muted-foreground">
                Gagal memuat sesi kelas.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={fetchSessions}
              >
                Coba lagi
              </Button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-7 gap-1">
                {cells.map((day, i) => {
                  if (day === null) return <div key={i} />;
                  const dateStr = ymd(year, month, day);
                  const daySessions = sessionsByDate.get(dateStr) ?? [];
                  return (
                    <div
                      key={i}
                      className="flex aspect-square min-h-[64px] flex-col gap-0.5 overflow-hidden rounded-lg border border-border p-1"
                    >
                      <span className="text-xs font-medium text-muted-foreground">
                        {day}
                      </span>
                      {daySessions.map((s) => {
                        const isSubstitute =
                          s.teacherId !== s.defaultTeacherId;
                        return (
                          <button
                            key={s.id}
                            onClick={() => openSession(s)}
                            className="rounded-md bg-accent/60 px-1 py-0.5 text-left transition-colors hover:bg-accent"
                          >
                            <span className="block truncate text-caption font-medium text-foreground">
                              {SLOT_LABELS[s.slot] ?? s.slot}
                            </span>
                            <span className="block truncate text-caption text-muted-foreground">
                              {s.teacher?.nama ?? "Belum ada guru"}
                            </span>
                            {isSubstitute && (
                              <Badge
                                variant="outline"
                                className="mt-0.5 px-1 py-0 text-caption leading-tight"
                              >
                                Pengganti
                              </Badge>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
              {sessions.length === 0 && (
                <p className="mt-4 text-center text-sm text-muted-foreground">
                  Belum ada sesi kelas pada bulan ini.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Edit dialog ─────────────────────────────────────────── */}
      <ResponsiveFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Ubah Kelas"
        description="Perbarui nama, kapasitas, atau pola slot."
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setEditOpen(false)}
              disabled={savingEdit}
            >
              Batal
            </Button>
            <Button onClick={saveEdit} disabled={savingEdit}>
              {savingEdit ? "Menyimpan..." : "Simpan"}
            </Button>
          </>
        }
      >
        <div className="space-y-field">
          <Field>
            <FieldLabel>Nama kelas</FieldLabel>
            <Input
              value={editForm.name}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, name: e.target.value }))
              }
              placeholder="mis. TKIT A"
            />
          </Field>
          <Field>
            <FieldLabel>Kapasitas</FieldLabel>
            <Input
              type="number"
              min={1}
              max={200}
              value={editForm.capacity}
              onChange={(e) =>
                setEditForm((f) => ({
                  ...f,
                  capacity: Number.parseInt(e.target.value || "0", 10) || 0,
                }))
              }
            />
          </Field>
          <Field>
            <FieldLabel>Pola slot</FieldLabel>
            <Select
              value={editForm.slotTemplate}
              onValueChange={(v) =>
                setEditForm((f) => ({
                  ...f,
                  slotTemplate: (v as SlotTemplate) ?? "FULL_DAY",
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FULL_DAY">Sehari penuh</SelectItem>
                <SelectItem value="MORNING_AND_AFTERNOON">
                  Pagi & sore
                </SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
      </ResponsiveFormDialog>

      {/* ── Add-student dialog ──────────────────────────────────── */}
      <ResponsiveFormDialog
        open={addStudentOpen}
        onOpenChange={setAddStudentOpen}
        title="Tambah Siswa"
        description="Pilih siswa aktif yang belum terdaftar di kelas ini."
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setAddStudentOpen(false)}
              disabled={addingStudent}
            >
              Batal
            </Button>
            <Button onClick={submitAddStudent} disabled={addingStudent}>
              {addingStudent ? "Menambahkan..." : "Tambahkan"}
            </Button>
          </>
        }
      >
        <div className="space-y-field">
          <Field>
            <FieldLabel>Siswa</FieldLabel>
            <Select
              value={selectedStudentId}
              onValueChange={(v) => setSelectedStudentId(v ?? "")}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pilih siswa..." />
              </SelectTrigger>
              <SelectContent>
                {studentOptions.length === 0 ? (
                  <SelectItem value="__empty" disabled>
                    Tidak ada siswa tersedia
                  </SelectItem>
                ) : (
                  studentOptions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                      {s.nis ? ` · ${s.nis}` : ""}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Hanya siswa berstatus aktif yang muncul. Siswa yang sudah
              terdaftar di kelas lain pada tahun ajaran ini akan ditolak oleh
              server.
            </p>
          </Field>
        </div>
      </ResponsiveFormDialog>

      {/* ── Remove-student confirm ──────────────────────────────── */}
      <ConfirmDialog
        open={!!removeStudentTarget}
        onOpenChange={(v) => !v && setRemoveStudentTarget(null)}
        title="Keluarkan siswa dari kelas?"
        description={
          removeStudentTarget
            ? `${removeStudentTarget.student.name} akan dikeluarkan dari ${data.name}. Pendaftaran akan ditandai WITHDRAWN.`
            : ""
        }
        confirmLabel="Keluarkan"
        destructive
        onConfirm={removeStudent}
      />

      {/* ── Add-teacher dialog ──────────────────────────────────── */}
      <ResponsiveFormDialog
        open={addTeacherOpen}
        onOpenChange={(v) => {
          setAddTeacherOpen(v);
          if (!v) setReplaceHomeroom(null);
        }}
        title="Tambah Guru Pengajar"
        description="Pilih guru aktif dan peran penugasan."
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setAddTeacherOpen(false)}
              disabled={addingTeacher}
            >
              Batal
            </Button>
            <Button onClick={submitAddTeacher} disabled={addingTeacher}>
              {addingTeacher ? "Menambahkan..." : "Tambahkan"}
            </Button>
          </>
        }
      >
        <div className="space-y-field">
          <Field>
            <FieldLabel>Guru</FieldLabel>
            <Select
              value={selectedEmployeeId}
              onValueChange={(v) => setSelectedEmployeeId(v ?? "")}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pilih guru..." />
              </SelectTrigger>
              <SelectContent>
                {employeeOptions.length === 0 ? (
                  <SelectItem value="__empty" disabled>
                    Tidak ada guru tersedia
                  </SelectItem>
                ) : (
                  employeeOptions.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.nama}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {employeesTruncated && (
              <p className="text-xs text-muted-foreground">
                Daftar guru dipotong pada 100 nama — jika guru yang dicari
                tidak muncul, hubungi admin.
              </p>
            )}
          </Field>
          <Field>
            <FieldLabel>Peran</FieldLabel>
            <Select
              value={selectedRole}
              onValueChange={(v) =>
                setSelectedRole((v as TeachingRole) ?? "HOMEROOM")
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="HOMEROOM">Wali Kelas</SelectItem>
                <SelectItem value="ASSISTANT">Asisten</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
      </ResponsiveFormDialog>

      {/* ── Replace-homeroom confirm (layered atop add-teacher) ─── */}
      <ConfirmDialog
        open={!!replaceHomeroom}
        onOpenChange={(v) => !v && setReplaceHomeroom(null)}
        title="Ganti wali kelas?"
        description={
          replaceHomeroom
            ? `Kelas sudah memiliki wali kelas ${replaceHomeroom.existingEmployeeName}. Ganti dengan ${replaceHomeroom.newEmployeeName}?`
            : ""
        }
        confirmLabel="Ganti"
        onConfirm={confirmReplaceHomeroom}
      />

      {/* ── Remove-teacher confirm ──────────────────────────────── */}
      <ConfirmDialog
        open={!!removeTeacherTarget}
        onOpenChange={(v) => !v && setRemoveTeacherTarget(null)}
        title="Hapus guru dari kelas?"
        description={
          removeTeacherTarget
            ? `${removeTeacherTarget.employee.nama} (${ROLE_LABEL[removeTeacherTarget.role]}) akan dihapus dari ${data.name}.`
            : ""
        }
        confirmLabel="Hapus"
        destructive
        onConfirm={removeTeacher}
      />

      {/* ── Deactivate confirm ──────────────────────────────────── */}
      <ConfirmDialog
        open={deactivateOpen}
        onOpenChange={setDeactivateOpen}
        title={`Nonaktifkan "${data.name}"?`}
        description={
          enrolledCount > 0
            ? `Kelas memiliki ${enrolledCount} siswa aktif yang tidak akan otomatis dipindahkan. Tidak akan muncul di daftar aktif. Bisa diaktifkan kembali kapan saja.`
            : "Tidak akan muncul di daftar aktif. Bisa diaktifkan kembali kapan saja."
        }
        confirmLabel="Nonaktifkan"
        onConfirm={() => flipStatus("INACTIVE")}
      />

      {/* ── Reactivate confirm ──────────────────────────────────── */}
      <ConfirmDialog
        open={reactivateOpen}
        onOpenChange={setReactivateOpen}
        title="Aktifkan kembali kelas?"
        description={`${data.name} akan muncul kembali di daftar aktif.`}
        confirmLabel="Aktifkan"
        onConfirm={() => flipStatus("ACTIVE")}
      />

      {/* ── Teacher-swap drawer (relocated verbatim) ────────────── */}
      <Sheet
        open={selectedSession !== null}
        onOpenChange={(open) => {
          if (!open) closeSwap();
        }}
      >
        <SheetContent>
          {selectedSession && (
            <>
              <SheetHeader>
                <SheetTitle>Ubah Guru Sesi</SheetTitle>
                <SheetDescription>
                  {new Date(
                    selectedSession.date + "T00:00:00",
                  ).toLocaleDateString("id-ID", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}{" "}
                  · {SLOT_LABELS[selectedSession.slot] ?? selectedSession.slot}
                </SheetDescription>
              </SheetHeader>

              <div className="flex flex-col gap-4 px-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Wali kelas</span>
                  <span className="font-medium">
                    {selectedSession.defaultTeacher?.nama ?? "Tidak ada"}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Guru saat ini</span>
                  <span className="font-medium">
                    {selectedSession.teacher?.nama ?? "Belum ada guru"}
                  </span>
                </div>

                {canWrite ? (
                  <>
                    <Field>
                      <FieldLabel>Guru pengganti</FieldLabel>
                      <Select
                        value={swapTeacherId}
                        onValueChange={(v) =>
                          setSwapTeacherId(String(v ?? ""))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Pilih guru" />
                        </SelectTrigger>
                        <SelectContent>
                          {employeeOptions.map((e) => (
                            <SelectItem key={e.id} value={e.id}>
                              {e.nama}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {employeesTruncated && (
                        <p className="text-xs text-muted-foreground">
                          Daftar guru dipotong pada 100 nama — jika guru yang
                          dicari tidak muncul, hubungi admin.
                        </p>
                      )}
                    </Field>

                    <Field>
                      <FieldLabel>Alasan pengganti</FieldLabel>
                      <Textarea
                        value={swapReason}
                        onChange={(e) => setSwapReason(e.target.value)}
                        placeholder="Contoh: wali kelas sedang cuti"
                        maxLength={300}
                        rows={3}
                      />
                    </Field>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Anda tidak memiliki akses untuk mengubah guru sesi.
                  </p>
                )}
              </div>

              {canWrite && (
                <SheetFooter>
                  <Button
                    onClick={() => submitSwap(swapTeacherId || null, swapReason)}
                    disabled={savingSwap}
                  >
                    {savingSwap ? "Menyimpan..." : "Simpan"}
                  </Button>
                  {selectedSession.defaultTeacherId && (
                    <Button
                      variant="outline"
                      disabled={savingSwap}
                      onClick={() =>
                        submitSwap(selectedSession.defaultTeacherId, "")
                      }
                    >
                      Kembalikan ke wali kelas
                    </Button>
                  )}
                </SheetFooter>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
