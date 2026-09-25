"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { LegacyColumnDef as ColumnDef } from "@tanstack/react-table/legacy";
import { Plus, Trash2, UserMinus } from "lucide-react";
import { toast } from "sonner";

import { DetailPageHeader } from "@/components/admin/detail-page-header";
import { DetailPageSkeleton } from "@/components/admin/detail-page-skeleton";
import { DossierNav, DossierSection, type DossierSectionDef } from "@/components/admin/dossier-section";
import { DetailRail, RailCard, RailKV, RailStatTiles } from "@/components/admin/detail-rail";
import {
  ClassSessionsCalendar,
  SLOT_LABELS,
  type SessionRow,
} from "@/components/admin/class-sessions-calendar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
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
import { StatusBadge, healthTone } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";

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

type Employee = { id: string; nama: string; formalName?: string | null };

type StudentOption = {
  id: string;
  name: string;
  nis: string | null;
  status: string;
};

type HealthBadge = "Sehat" | "Perhatian" | "Kritis" | "Tidak Aktif" | "Libur";

// ── Constants ────────────────────────────────────────────────────

const ROLE_LABEL: Record<TeachingRole, string> = {
  HOMEROOM: "Wali Kelas",
  ASSISTANT: "Asisten",
};

// Health-badge tone now comes from the shared `healthTone()` helper in
// components/ui/status-badge.ts (single source for both list + detail pages).

/**
 * Section ids double as DOM anchor targets for `DossierNav` — English
 * identifiers per the class-detail migration (copy stays Indonesian, ids
 * stay English so they read as stable API-ish anchors, matching the T0
 * English-slug pass elsewhere in this cycle).
 */
const SECTION_ROSTER = "roster";
const SECTION_TEACHERS = "teachers";
const SECTION_SESSIONS = "sessions";

// ── Helpers ──────────────────────────────────────────────────────

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
  const isMobile = useIsMobile();

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
  // Advisory age-band / dual-enrollment confirm step (T7) — populated from
  // the 409 the server returns; cleared whenever the dialog closes or the
  // selected student changes so a stale reason never rides along on an
  // unrelated submit. AGE_OUT_OF_RANGE is overridable with a reason;
  // ALREADY_ENROLLED is not.
  const [enrollBlock, setEnrollBlock] = useState<
    | { code: "AGE_OUT_OF_RANGE"; message: string }
    | { code: "ALREADY_ENROLLED"; message: string }
    | null
  >(null);
  const [ageOverrideReason, setAgeOverrideReason] = useState("");
  const enrollBannerRef = useRef<HTMLDivElement | null>(null);

  /**
   * Move focus to the enroll advisory when it appears.
   *
   * This used to be `setTimeout(() => enrollBannerRef.current?.focus(), 0)`
   * fired from the 409 handler. That races React: on some scheduling orders
   * the macrotask ran before the banner was committed, so the ref was still
   * null, `focus()` no-opped, and nothing retried. A sighted user never
   * noticed; a screen-reader user was left on the old step with a new one on
   * screen, and CI saw it as the long-standing T7 flake — the assertion waits
   * for a focus move that, on that run, was never going to happen.
   *
   * An effect runs after commit, so the ref is always attached.
   */
  useEffect(() => {
    if (!enrollBlock) return;
    enrollBannerRef.current?.focus();
  }, [enrollBlock]);

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

  // ── Dossier section open/collapse state ──────────────────────────
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    [SECTION_ROSTER]: true,
    [SECTION_TEACHERS]: true,
    [SECTION_SESSIONS]: true,
  });
  const setSectionOpen = useCallback((sectionId: string, open: boolean) => {
    setOpenSections((prev) => ({ ...prev, [sectionId]: open }));
  }, []);

  /** Nav click: expand first (a collapsed target is nothing to scroll to), then scroll. */
  const jumpToSection = useCallback(
    (sectionId: string) => {
      setSectionOpen(sectionId, true);
      requestAnimationFrame(() => {
        document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    },
    [setSectionOpen],
  );

  // ── Derived flags ───────────────────────────────────────────────
  const archived = data?.academicYear.status === "ARCHIVED";
  const writeAllowed = canWrite && !archived;
  const homeroomAssignment =
    data?.teachingAssignments.find((a) => a.role === "HOMEROOM") ?? null;
  const enrolledCount = data?.enrollments.length ?? 0;

  // Health metric inputs — `attendance7dPct` + `todaySession` are not exposed
  // by the detail GET this cycle (list page enrichment lives on the index
  // route). Wires up when the detail endpoint adds health enrichment in a
  // follow-up. For now the rail's Kehadiran + Sesi tiles render dashes and
  // the Ringkasan card falls back to StatusBadge instead of a Kondisi badge.
  // Typed as the wide unions so the JSX branches are reachable when the
  // placeholder lifts.
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
    setEnrollBlock(null);
    setAgeOverrideReason("");
    setAddStudentOpen(true);
    loadStudentOptions();
  }

  // Closes the add-student dialog and clears the advisory-warning step —
  // the single choke point every close path (success, Batal, escape,
  // overlay click) routes through so a stale reason/warning never survives
  // to the next open.
  function closeAddStudent() {
    setAddStudentOpen(false);
    setEnrollBlock(null);
    setAgeOverrideReason("");
  }

  // Steps back from the confirm step to the student picker without closing
  // the dialog — used by "Batal" inside the AGE_OUT_OF_RANGE step and
  // "Pilih Siswa Lain" inside the ALREADY_ENROLLED step.
  function cancelEnrollBlock() {
    setEnrollBlock(null);
    setAgeOverrideReason("");
  }

  async function submitAddStudent() {
    if (!selectedStudentId) {
      toast.error("Pilih siswa");
      return;
    }
    const overridingAge = enrollBlock?.code === "AGE_OUT_OF_RANGE";
    if (overridingAge && !ageOverrideReason.trim()) return; // confirm button is disabled for this too — defensive only
    setAddingStudent(true);
    try {
      const res = await fetch(
        `/api/admin/classes/${classId}/enrollments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            studentId: selectedStudentId,
            ...(overridingAge ? { ageOverrideReason: ageOverrideReason.trim() } : {}),
          }),
        },
      );
      if (res.ok) {
        toast.success("Siswa ditambahkan");
        closeAddStudent();
        fetchDetail();
        return;
      }
      const d = await res.json().catch(() => ({}));
      if (
        res.status === 409 &&
        (d.code === "AGE_OUT_OF_RANGE" || d.code === "ALREADY_ENROLLED")
      ) {
        // Advisory step, not a toast — the server message already names the
        // age/band/reference date (AGE_OUT_OF_RANGE) or the conflicting
        // class (ALREADY_ENROLLED); render it verbatim rather than
        // rebuilding the sentence client-side.
        // Focus moves to the banner in the effect above, once React has
        // actually committed it.
        setEnrollBlock({ code: d.code, message: d.error });
        return;
      }
      toast.error(d.error ?? "Gagal menambahkan siswa");
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

  // ── Deep-linkable sections ────────────────────────────────────────
  // `#roster`, `#teachers`, `#sessions` — every section id is already a DOM
  // anchor, but the browser's own hash scroll fires before the section
  // exists and lands on nothing. Honouring the hash ourselves (once the
  // class has loaded) is what makes a link into the dossier actually work.
  const hashHandled = useRef(false);
  useEffect(() => {
    if (loading || hashHandled.current) return;
    const target = window.location.hash.replace(/^#/, "");
    if (!target) {
      hashHandled.current = true;
      return;
    }
    if (!document.getElementById(target)) return;
    hashHandled.current = true;
    jumpToSection(target);
  }, [loading, jumpToSection]);

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
                  <span className="text-xs">Keluarkan dari Kelas Ini</span>
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
    return <DetailPageSkeleton />;
  }

  if (loadError || !data) {
    return (
      <EmptyState
        title="Kelas tidak ditemukan"
        description="Kelas tidak ada atau Anda tidak memiliki akses."
      />
    );
  }

  const homeroomLabel = homeroomAssignment
    ? ` · Wali Kelas: ${homeroomAssignment.employee.nama}`
    : "";

  // Section labels for the Sesi Hari Ini rail tile
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

  const navSections: DossierSectionDef[] = [
    { id: SECTION_ROSTER, label: "Daftar Siswa" },
    { id: SECTION_TEACHERS, label: "Guru Pengajar" },
    { id: SECTION_SESSIONS, label: "Kalender Sesi" },
  ];

  const statTiles = [
    { label: "Roster", value: `${enrolledCount}/${data.capacity}` },
    {
      label: "Kehadiran 7 Hari",
      value:
        attendance7dPct !== null ? `${attendance7dPct.toFixed(0)}%` : "—",
    },
    { label: "Sesi Hari Ini", value: sesiHariIniLabel },
  ];

  const summaryItems = [
    {
      label: "Kondisi",
      value: healthBadge ? (
        <Badge variant="outline" className={healthTone(healthBadge)}>
          {healthBadge}
        </Badge>
      ) : (
        <StatusBadge status={data.status} />
      ),
    },
    { label: "Wali Kelas", value: homeroomAssignment?.employee.nama ?? "—" },
    { label: "Program", value: data.program.name },
    { label: "Tahun Ajaran", value: data.academicYear.name },
    { label: "Kampus", value: data.campus.name },
    {
      label: "Pola Waktu",
      value:
        data.slotTemplate === "FULL_DAY" ? "Sehari Penuh" : "Pagi & Sore",
    },
    { label: "Kapasitas", value: String(data.capacity) },
  ];

  return (
    <>
      {/* ── Page header ──────────────────────────────────────────── */}
      <DetailPageHeader
        backHref="/admin/classes"
        backLabel="Kembali ke Daftar Kelas"
        title={`${data.name} · ${data.academicYear.name}`}
        description={`${data.program.name}${homeroomLabel}`}
        badge={<Badge variant="outline">{data.campus.name}</Badge>}
        actions={
          writeAllowed ? (
            <>
              <Button variant="outline" size="sm" onClick={openEdit}>
                Ubah
              </Button>
              {data.status === "ACTIVE" ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDeactivateOpen(true)}
                  className="text-destructive hover:text-destructive"
                >
                  Nonaktifkan
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
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
        <div className="mb-section rounded-md border border-status-leave bg-status-leave-subtle px-4 py-3 text-sm text-status-leave-text">
          Tahun ajaran ini sudah diarsipkan. Tampilan hanya baca.
        </div>
      )}

      {/* Mobile: the rail's numbers move above the sections so the first
          viewport still answers "how is this class doing". */}
      {isMobile && (
        <div className="mb-4">
          <RailStatTiles tiles={statTiles} />
        </div>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <DossierNav sections={navSections} onJump={jumpToSection} />

          {/* ── Daftar Siswa ─────────────────────────────────────── */}
          <DossierSection
            id={SECTION_ROSTER}
            label="Daftar Siswa"
            badge={
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {enrolledCount} siswa
              </span>
            }
            open={openSections[SECTION_ROSTER] ?? true}
            onOpenChange={(o) => setSectionOpen(SECTION_ROSTER, o)}
            actions={
              writeAllowed ? (
                <Button size="sm" variant="ghost" onClick={openAddStudent}>
                  <Plus size={12} className="mr-1" aria-hidden="true" /> Tambah Siswa
                </Button>
              ) : undefined
            }
          >
            <p className="mb-3 text-small text-muted-foreground">
              {enrolledCount} siswa aktif dari kapasitas {data.capacity}.
            </p>
            <DataTable
              columns={rosterColumns}
              data={data.enrollments}
              emptyTitle="Belum ada siswa terdaftar di kelas ini."
              emptyDescription="Siswa yang terdaftar di kelas ini akan tampil di sini."
            />
          </DossierSection>

          {/* ── Guru Pengajar ────────────────────────────────────── */}
          <DossierSection
            id={SECTION_TEACHERS}
            label="Guru Pengajar"
            badge={
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {data.teachingAssignments.length} guru
              </span>
            }
            open={openSections[SECTION_TEACHERS] ?? true}
            onOpenChange={(o) => setSectionOpen(SECTION_TEACHERS, o)}
            actions={
              writeAllowed ? (
                <Button size="sm" variant="ghost" onClick={openAddTeacher}>
                  <Plus size={12} className="mr-1" aria-hidden="true" /> Tambah Guru Pengajar
                </Button>
              ) : undefined
            }
          >
            <p className="mb-3 text-small text-muted-foreground">
              Wali kelas + asisten.
            </p>
            <DataTable
              columns={teacherColumns}
              data={data.teachingAssignments}
              emptyTitle="Belum ada guru ditugaskan."
              emptyDescription="Guru yang ditugaskan mengajar kelas ini akan tampil di sini."
            />
          </DossierSection>

          {/* ── Kalender Sesi (relocated verbatim from class-sections) ── */}
          <DossierSection
            id={SECTION_SESSIONS}
            label="Kalender Sesi"
            open={openSections[SECTION_SESSIONS] ?? true}
            onOpenChange={(o) => setSectionOpen(SECTION_SESSIONS, o)}
          >
            <p className="mb-3 text-small text-muted-foreground">
              Klik sesi untuk mengubah guru pengganti.
            </p>
            <ClassSessionsCalendar
              year={year}
              month={month}
              onPrevMonth={prevMonth}
              onNextMonth={nextMonth}
              sessions={sessions}
              loading={sessionsLoading}
              error={sessionsError}
              onRetry={fetchSessions}
              onOpenSession={openSession}
            />
          </DossierSection>
        </div>

        {/* Desktop rail. On mobile the stat tiles already rendered above and
            the Ringkasan card falls to the end of the document, after the
            sections — same split as guardians/[id] and students/[id]. */}
        {isMobile ? (
          <div className="mt-2 flex flex-col gap-4">
            <RailCard title="Ringkasan">
              <RailKV items={summaryItems} />
            </RailCard>
          </div>
        ) : (
          <DetailRail>
            <RailStatTiles tiles={statTiles} />
            <RailCard title="Ringkasan">
              <RailKV items={summaryItems} />
            </RailCard>
          </DetailRail>
        )}
      </div>

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
            <FieldLabel htmlFor="class-detail-name" required>Nama kelas</FieldLabel>
            <Input
              id="class-detail-name"
              required
              aria-required="true"
              value={editForm.name}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, name: e.target.value }))
              }
              placeholder="mis. TKIT A"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="class-detail-capacity" required>Kapasitas</FieldLabel>
            <Input
              id="class-detail-capacity"
              required
              aria-required="true"
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
            <FieldLabel htmlFor="class-detail-slot-template" required>Pola Waktu Kelas</FieldLabel>
            <Select
              value={editForm.slotTemplate}
              onValueChange={(v) =>
                setEditForm((f) => ({
                  ...f,
                  slotTemplate: (v as SlotTemplate) ?? "FULL_DAY",
                }))
              }
            >
              <SelectTrigger id="class-detail-slot-template" aria-required="true">
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

      {/* ── Add-student dialog ──────────────────────────────────────────
          Two mutually-exclusive steps share one dialog instance: picker →
          (409) advisory confirm step. AGE_OUT_OF_RANGE is overridable with
          a required reason; ALREADY_ENROLLED is not. */}
      {(() => {
        const overridingAge = enrollBlock?.code === "AGE_OUT_OF_RANGE";
        const alreadyEnrolled = enrollBlock?.code === "ALREADY_ENROLLED";
        const reasonEmpty = !ageOverrideReason.trim();

        let body: React.ReactNode;
        let footer: React.ReactNode;

        if (alreadyEnrolled) {
          body = (
            <Alert ref={enrollBannerRef} tabIndex={-1} variant="destructive">
              <AlertTitle>Siswa sudah terdaftar</AlertTitle>
              <AlertDescription>{enrollBlock.message}</AlertDescription>
            </Alert>
          );
          footer = (
            <Button type="button" variant="ghost" onClick={cancelEnrollBlock}>
              Pilih Siswa Lain
            </Button>
          );
        } else if (overridingAge) {
          body = (
            <>
              <Alert ref={enrollBannerRef} tabIndex={-1}>
                <AlertTitle>Usia di luar batas program</AlertTitle>
                <AlertDescription>{enrollBlock.message}</AlertDescription>
              </Alert>
              <Field>
                <FieldLabel htmlFor="class-student-age-override-reason" required>
                  Alasan
                </FieldLabel>
                <Textarea
                  id="class-student-age-override-reason"
                  required
                  aria-required="true"
                  value={ageOverrideReason}
                  onChange={(e) => setAgeOverrideReason(e.target.value)}
                  placeholder="Contoh: penempatan sesuai kemampuan anak, atau anak telat masuk sekolah"
                  rows={3}
                />
                <FieldDescription>Alasan wajib diisi sebelum melanjutkan.</FieldDescription>
              </Field>
            </>
          );
          footer = (
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={cancelEnrollBlock}
                disabled={addingStudent}
              >
                Batal
              </Button>
              <Button onClick={submitAddStudent} disabled={addingStudent || reasonEmpty}>
                {addingStudent ? "Menambahkan..." : "Tetap Tambahkan"}
              </Button>
            </>
          );
        } else {
          body = (
            <Field>
              <FieldLabel htmlFor="class-student" required>Siswa</FieldLabel>
              <Select
                value={selectedStudentId}
                onValueChange={(v) => {
                  setSelectedStudentId(v ?? "");
                  setEnrollBlock(null);
                  setAgeOverrideReason("");
                }}
              >
                <SelectTrigger id="class-student" aria-required="true">
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
                Hanya siswa berstatus aktif yang muncul. Batas usia program
                dan kelas lain yang sudah diikuti siswa akan diperiksa saat
                disimpan.
              </p>
            </Field>
          );
          footer = (
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={closeAddStudent}
                disabled={addingStudent}
              >
                Batal
              </Button>
              <Button onClick={submitAddStudent} disabled={addingStudent}>
                {addingStudent ? "Menambahkan..." : "Tambahkan"}
              </Button>
            </>
          );
        }

        return (
          <ResponsiveFormDialog
            open={addStudentOpen}
            onOpenChange={(o) => {
              setAddStudentOpen(o);
              if (!o) {
                setEnrollBlock(null);
                setAgeOverrideReason("");
              }
            }}
            title="Tambah Siswa"
            description="Pilih siswa aktif yang belum terdaftar di kelas ini."
            footer={footer}
          >
            <div className="space-y-field">{body}</div>
          </ResponsiveFormDialog>
        );
      })()}

      {/* ── Remove-student confirm ──────────────────────────────── */}
      <ConfirmDialog
        open={!!removeStudentTarget}
        onOpenChange={(v) => !v && setRemoveStudentTarget(null)}
        title="Keluarkan siswa dari kelas?"
        description={
          removeStudentTarget
            ? `${removeStudentTarget.student.name} akan dikeluarkan dari ${data.name}. Pendaftaran akan ditandai Keluar.`
            : ""
        }
        confirmLabel="Keluarkan dari Kelas Ini"
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
            <FieldLabel htmlFor="class-teacher" required>Guru</FieldLabel>
            <Select
              value={selectedEmployeeId}
              onValueChange={(v) => setSelectedEmployeeId(v ?? "")}
            >
              <SelectTrigger id="class-teacher" aria-required="true">
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
            <FieldLabel htmlFor="class-teaching-role" required>Peran</FieldLabel>
            <Select
              value={selectedRole}
              onValueChange={(v) =>
                setSelectedRole((v as TeachingRole) ?? "HOMEROOM")
              }
            >
              <SelectTrigger id="class-teaching-role" aria-required="true">
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
                      <FieldLabel htmlFor="session-substitute-teacher">Guru pengganti</FieldLabel>
                      <Select
                        value={swapTeacherId}
                        onValueChange={(v) =>
                          setSwapTeacherId(String(v ?? ""))
                        }
                      >
                        <SelectTrigger id="session-substitute-teacher">
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
                      <FieldLabel htmlFor="session-substitute-reason">Alasan pengganti</FieldLabel>
                      <Textarea
                        id="session-substitute-reason"
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
    </>
  );
}
