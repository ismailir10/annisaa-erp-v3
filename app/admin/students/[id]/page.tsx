"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { DetailPageHeader } from "@/components/admin/detail-page-header";
import { DetailPageSkeleton } from "@/components/admin/detail-page-skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useIsMobile } from "@/hooks/use-mobile";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/ui/section-heading";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { User, MapPin, GraduationCap, Plus, Pencil, Trash2, X, Save, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { formatDateShort, formatRupiah } from "@/lib/format";
import { telHref, whatsappHref } from "@/lib/contact";
import {
  LIVING_WITH_OPTIONS,
  RELATIONSHIP_OPTIONS,
  REL_LABELS,
  LIVING_WITH_LABELS,
  MATCH_REASON_LABELS,
} from "@/lib/constants/parent-options";
import { ParentPicker, type PickableParent } from "@/components/admin/parent-picker";
import type { ParentCandidate } from "@/lib/parent/match";
import { deriveSiblings } from "@/lib/parent/siblings";
import { GuardianFormBody, EMPTY_GUARDIAN_FORM, type GuardianForm } from "@/components/admin/guardian-edit-dialog";
import { ClassSectionCombobox, type ClassSection } from "@/components/admin/class-section-picker";
import { StudentEnrollDialog } from "@/components/admin/student-enroll-dialog";
import { pickPrimaryEnrollment } from "@/lib/enrollment/active";
import { DossierNav, DossierSection, type DossierSectionDef } from "@/components/admin/dossier-section";
import {
  DetailRail,
  RailCard,
  RailKV,
  RailStatTiles,
  RailChecklist,
} from "@/components/admin/detail-rail";
import { GuardianDetailCard, type GuardianCardData } from "@/components/admin/guardian-detail-card";
import { StudentHealthBlock } from "@/components/admin/student-health-block";
import { StudentFinanceBlock, type StudentInvoiceRow } from "@/components/admin/student-finance-block";
import { StudentKeringananBlock } from "@/components/admin/student-keringanan-block";
import { StudentJournalBlock } from "@/components/admin/student-journal-block";
import { StudentAcademicsBlock } from "@/components/admin/student-academics-block";
import { StudentEnrollmentApplicationBlock } from "@/components/admin/student-enrollment-application-block";
import type { StudentOverview } from "@/lib/student/overview";
import {
  summarizeStudentInvoices,
  EMPTY_INVOICE_SUMMARY,
} from "@/lib/finance/student-invoice-summary";
import { MaskedValue } from "@/components/admin/masked-value";
import {
  parseStudentMetadata,
  splitStudentMetadata,
  buildStudentMetadata,
  healthFlags,
  type StudentSystemMetadata,
  type MetadataExtraRow,
} from "@/lib/student/metadata";
import { formatAgeShort } from "@/lib/student/age";

type Sibling = { id: string; name: string; status: string };
type Guardian = GuardianCardData & { parent: GuardianCardData["parent"] & { guardians?: { student: Sibling }[] } };
type Enrollment = { id: string; enrollDate: string; status: string; classSection: { id: string; name: string; program: { name: string; code: string; type: string }; academicYear: { name: string; status: string }; campus: { name: string } } };
type Student = {
  id: string; name: string; nickname: string | null; dateOfBirth: string | null;
  gender: string | null; address: string | null; notes: string | null; metadata: string | null; status: string;
  nis: string | null; nisn: string | null; birthPlace: string | null;
  nik: string | null; kkNumber: string | null; livingWith: string | null;
  photoUrl: string | null;
  createdAt: string | null;
  withdrawalReason: string | null;
  withdrawalDate: string | null;
  graduationDate: string | null;
  guardians: Guardian[]; enrollments: Enrollment[];
};

type AttendanceRecord = { id: string; date: string; status: string; notes: string | null; classSection: { name: string } };
type AttendanceSummary = { present: number; absent: number; sick: number; permission: number; total: number };

const EMPTY_SYSTEM_METADATA: StudentSystemMetadata = {
  fromEnrollmentApplication: null,
  dcareAddon: false,
  priorFamilyAttendees: [],
};

/**
 * Section ids double as DOM anchor targets for `DossierNav`. Order here is the
 * render order and the nav order — one list, no second place to forget.
 */
const SECTION_DATA_ANAK = "data-anak";
const SECTION_KESEHATAN = "kesehatan";
const SECTION_KELUARGA = "keluarga";
const SECTION_RIWAYAT_KELAS = "riwayat-kelas";
const SECTION_KEHADIRAN = "kehadiran";
const SECTION_KEUANGAN = "keuangan";
const SECTION_KERINGANAN = "keringanan";
const SECTION_JURNAL = "buku-penghubung";
const SECTION_AKADEMIK = "akademik";
const SECTION_PENDAFTARAN = "pendaftaran";
const SECTION_DOKUMEN = "dokumen";
const SECTION_STATUS = "riwayat-status";
const SECTION_TAMBAHAN = "informasi-tambahan";

export default function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const isMobile = useIsMobile();
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);

  // Edit toggle
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", nickname: "", dateOfBirth: "", gender: "", address: "", notes: "", nis: "", nisn: "", birthPlace: "", nik: "", kkNumber: "", livingWith: "" });
  const [savingStudent, setSavingStudent] = useState(false);

  // Photo upload (Data Anak card)
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  // Cache-bust the auth-proxied photo URL after upload/delete so <img> reloads.
  const [photoVersion, setPhotoVersion] = useState(0);

  // --- Metadata, in three buckets (see lib/student/metadata.ts) ---
  // `known` and `system` are new; `metadataRows` is the pre-existing free-form
  // editor, now fed only the leftovers so it stops showing machine keys.
  const [metaKnown, setMetaKnown] = useState<Record<string, string>>({});
  const [metaSystem, setMetaSystem] = useState<StudentSystemMetadata>(EMPTY_SYSTEM_METADATA);
  const [healthDraft, setHealthDraft] = useState<Record<string, string>>({});
  const [editingHealth, setEditingHealth] = useState(false);
  const [savingHealth, setSavingHealth] = useState(false);

  type MetadataRow = { id: string; key: string; value: string };
  const [metadataRows, setMetadataRows] = useState<MetadataRow[]>([]);
  const [savingMetadata, setSavingMetadata] = useState(false);
  const [metadataDirty, setMetadataDirty] = useState(false);
  const metadataRowIdRef = useRef(0);
  const nextMetadataRowId = () => `m${++metadataRowIdRef.current}`;

  // Enroll dialog — state lives inside StudentEnrollDialog so typing an
  // override reason does not re-render the whole dossier. See that file.
  const [enrollDialog, setEnrollDialog] = useState(false);
  const [sections, setSections] = useState<ClassSection[]>([]);

  // Guardian dialog
  const [guardianDialog, setGuardianDialog] = useState(false);
  const [editingGuardian, setEditingGuardian] = useState<Guardian | null>(null);
  const [guardianForm, setGuardianForm] = useState<GuardianForm>(EMPTY_GUARDIAN_FORM);
  const [savingGuardian, setSavingGuardian] = useState(false);
  const [deleteGuardianTarget, setDeleteGuardianTarget] = useState<Guardian | null>(null);

  // Tambah Wali has three mutually exclusive steps inside one overlay, the
  // same shape the enroll dialog uses for its picker → 409-advisory flow:
  //   "link"       — search an existing wali (the default; one Parent row is
  //                  meant to be shared across siblings)
  //   "create"     — the full bio form, for a wali genuinely not on file yet
  //   "candidates" — the server found look-alikes and wants a decision
  const [guardianStep, setGuardianStep] = useState<"link" | "create" | "candidates">("link");
  const [pickedParent, setPickedParent] = useState<PickableParent | null>(null);
  const [linkRelationship, setLinkRelationship] = useState("IBU");
  const [linkChildOrder, setLinkChildOrder] = useState("");
  const [candidates, setCandidates] = useState<ParentCandidate[]>([]);
  const guardianBannerRef = useRef<HTMLDivElement | null>(null);

  /**
   * Focus the "wali serupa sudah terdaftar" advisory once React has committed
   * it. Was `setTimeout(…, 0)` from the 409 handler, which can run before the
   * commit — ref still null, focus silently dropped, nothing retries. Same
   * defect as `app/admin/classes/[id]/client.tsx`; see
   * `docs/cycles/2026-08-22-vitest-flake-fix.md`.
   */
  useEffect(() => {
    if (guardianStep !== "candidates") return;
    guardianBannerRef.current?.focus();
  }, [guardianStep]);

  // Promote (Naik Kelas)
  const [promoteDialog, setPromoteDialog] = useState(false);
  const [promoteTarget, setPromoteTarget] = useState("");
  const [promoteNotes, setPromoteNotes] = useState("");
  const [promoting, setPromoting] = useState(false);

  // Graduate (Luluskan)
  const [graduateOpen, setGraduateOpen] = useState(false);
  const [graduating, setGraduating] = useState(false);

  // Withdraw (Keluarkan)
  const [withdrawDialog, setWithdrawDialog] = useState(false);
  const [withdrawReason, setWithdrawReason] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);

  // Lifecycle inline edit (T5) — withdrawal reason editable, dates read-only
  const [editingWithdrawalReason, setEditingWithdrawalReason] = useState(false);
  const [withdrawalEditValue, setWithdrawalEditValue] = useState("");
  const [savingWithdrawalReason, setSavingWithdrawalReason] = useState(false);

  // Attendance history
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [attendanceSummary, setAttendanceSummary] = useState<AttendanceSummary | null>(null);
  const [attendanceMonth, setAttendanceMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const attendanceRequested = useRef(false);

  // --- Keuangan (increment 2) ---
  // Eager, unlike Kehadiran: the rail's Tunggakan tile reads this summary, and
  // a tile that only fills once the admin opens a section below the fold is a
  // tile that always reads as zero.
  const [invoices, setInvoices] = useState<StudentInvoiceRow[] | null>(null);
  const [invoicesError, setInvoicesError] = useState(false);

  // --- Lazy sections (increment 2) ---
  // One-way latches: opening the section pays for the fetch, closing it again
  // does not un-fetch, and re-opening does not re-request.
  const [keringananActive, setKeringananActive] = useState(false);
  const [keringananCount, setKeringananCount] = useState<number | null>(null);
  const [jurnalActive, setJurnalActive] = useState(false);

  // --- Overview aggregate + lazy sections (increment 3) ---
  // The overview route is the only *eager* addition this increment makes, and
  // it is aggregates-only: the Kehadiran and Raport rail tiles read it, and a
  // tile that fills only after an admin opens a section below the fold is a
  // tile that always reads as zero. Fired alongside the student fetch, so it
  // adds no latency to the critical path.
  const [overview, setOverview] = useState<StudentOverview | null>(null);
  const [overviewError, setOverviewError] = useState(false);
  const [akademikActive, setAkademikActive] = useState(false);
  const [pendaftaranActive, setPendaftaranActive] = useState(false);

  // --- Section open/collapse state ---
  // Kehadiran starts closed on every viewport: it is the one section that costs
  // a second request, and opening it is what triggers the fetch.
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => ({
    [SECTION_DATA_ANAK]: true,
    [SECTION_KESEHATAN]: true,
    [SECTION_KELUARGA]: true,
    [SECTION_RIWAYAT_KELAS]: true,
    [SECTION_KEHADIRAN]: false,
    [SECTION_KEUANGAN]: true,
    // Both cost a request, so both start closed — same rule as Kehadiran.
    [SECTION_KERINGANAN]: false,
    [SECTION_JURNAL]: false,
    // Increment 3's two sections follow the same rule: each costs a request.
    [SECTION_AKADEMIK]: false,
    [SECTION_PENDAFTARAN]: false,
    [SECTION_DOKUMEN]: true,
    [SECTION_STATUS]: true,
    [SECTION_TAMBAHAN]: true,
  }));
  // Once the admin has collapsed or expanded anything, stop rearranging the
  // page underneath them on a resize.
  const sectionsTouched = useRef(false);

  const setSectionOpen = useCallback((sectionId: string, open: boolean) => {
    sectionsTouched.current = true;
    setOpenSections((prev) => ({ ...prev, [sectionId]: open }));
  }, []);

  const fetchStudent = useCallback(async () => {
    try {
      const res = await fetch(`/api/students/${id}`);
      if (!res.ok) { toast.error("Gagal memuat data siswa"); return; }
      const data = (await res.json()) as Student;
      setStudent(data);

      // Split the blob once, here, so every consumer below reads typed state
      // instead of re-parsing JSON.
      const parsed = parseStudentMetadata(data.metadata);
      const split = splitStudentMetadata(parsed);
      setMetaKnown(split.known);
      setMetaSystem(split.system);
      setHealthDraft(split.known);
      setEditingHealth(false);
      // Each free-form row gets a stable local id so React keys survive edits,
      // adds and removes.
      setMetadataRows(
        split.extra.map((row) => ({ id: nextMetadataRowId(), key: row.key, value: row.value })),
      );
      setMetadataDirty(false);
      setWithdrawalEditValue(data.withdrawalReason ?? "");
      setEditingWithdrawalReason(false);
    } catch { toast.error("Terjadi kesalahan"); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { fetchStudent(); }, [fetchStudent]);

  /**
   * One page of invoices for this student. pageSize 100 because a child's
   * whole billing history is tens of rows at most, so one request is the
   * complete answer and the summary below it is not a partial sum.
   *
   * Failure is silent here — no toast. The student record still renders, and
   * the Keuangan section states the failure with its own retry. A toast for a
   * side-panel fetch on page load would fire on every offline hiccup.
   */
  const fetchInvoices = useCallback(async () => {
    setInvoicesError(false);
    try {
      const res = await fetch(`/api/invoices?studentId=${encodeURIComponent(id)}&pageSize=100`);
      if (!res.ok) { setInvoicesError(true); return; }
      const json = await res.json();
      setInvoices(Array.isArray(json?.data) ? json.data : []);
    } catch {
      setInvoicesError(true);
    }
  }, [id]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  /**
   * The dossier's number tiles, as aggregates. Silent on failure for the same
   * reason the invoice fetch is: the student record still renders, and a
   * side-panel fetch toasting on every offline hiccup is noise. Each tile shows
   * a dash instead — never a zero, which an admin would read as a real answer.
   */
  const fetchOverview = useCallback(async () => {
    setOverviewError(false);
    try {
      const res = await fetch(`/api/students/${id}/overview`);
      if (!res.ok) { setOverviewError(true); return; }
      setOverview((await res.json()) as StudentOverview);
    } catch {
      setOverviewError(true);
    }
  }, [id]);

  useEffect(() => { fetchOverview(); }, [fetchOverview]);

  // Mobile default: one open section, not eight. Runs only while the admin has
  // not touched a disclosure themselves.
  useEffect(() => {
    if (!isMobile || sectionsTouched.current) return;
    setOpenSections((prev) => {
      const next: Record<string, boolean> = {};
      for (const key of Object.keys(prev)) next[key] = key === SECTION_DATA_ANAK;
      return next;
    });
  }, [isMobile]);

  const fetchAttendance = useCallback(async (month: string) => {
    setAttendanceLoading(true);
    try {
      const res = await fetch(`/api/students/${id}/attendance?month=${month}`);
      if (!res.ok) { toast.error("Gagal memuat riwayat kehadiran"); return; }
      const data = await res.json();
      setAttendanceRecords(data.records);
      setAttendanceSummary(data.summary);
    } catch { toast.error("Terjadi kesalahan"); }
    finally { setAttendanceLoading(false); }
  }, [id]);

  /** First open of the Kehadiran section pays for the fetch; later opens do not. */
  const ensureAttendance = useCallback(() => {
    if (attendanceRequested.current) return;
    attendanceRequested.current = true;
    fetchAttendance(attendanceMonth);
  }, [fetchAttendance, attendanceMonth]);

  const handleSectionOpenChange = useCallback(
    (sectionId: string, open: boolean) => {
      setSectionOpen(sectionId, open);
      if (open && sectionId === SECTION_KEHADIRAN) ensureAttendance();
      if (open && sectionId === SECTION_KERINGANAN) setKeringananActive(true);
      if (open && sectionId === SECTION_JURNAL) setJurnalActive(true);
      if (open && sectionId === SECTION_AKADEMIK) setAkademikActive(true);
      if (open && sectionId === SECTION_PENDAFTARAN) setPendaftaranActive(true);
    },
    [setSectionOpen, ensureAttendance],
  );

  /** Nav click: expand first (a collapsed target is nothing to scroll to), then scroll. */
  const jumpToSection = useCallback(
    (sectionId: string) => {
      handleSectionOpenChange(sectionId, true);
      requestAnimationFrame(() => {
        document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    },
    [handleSectionOpenChange],
  );

  /**
   * `#pendaftaran`, `#akademik`, `#keuangan` … — every section id is already a
   * DOM anchor, but the browser's own hash scroll fires before the section
   * exists and lands on nothing when the section is collapsed. Honouring the
   * hash ourselves is what makes a link into the dossier actually work, which
   * is the whole point of "deep-linkable": the Pendaftaran section is a lazy,
   * collapsed section three quarters down a long page.
   *
   * Runs once the student has loaded (before that there are no sections to
   * jump to) and only marks the intent as handled after it fires, so a hash
   * pointing at a section that renders conditionally still lands.
   */
  const hashHandled = useRef(false);
  useEffect(() => {
    if (loading || hashHandled.current) return;
    const target = window.location.hash.replace(/^#/, "");
    if (!target) { hashHandled.current = true; return; }
    if (!document.getElementById(target)) return;
    hashHandled.current = true;
    jumpToSection(target);
  }, [loading, jumpToSection, overview]);

  // --- Edit toggle ---
  function startEditing() {
    if (!student) return;
    // Switching to the main edit form hides the metadata editor block; warn before
    // discarding unsaved metadata rows so the user doesn't lose typed work.
    if (metadataDirty) {
      toast.error("Simpan informasi tambahan dulu sebelum mengedit data siswa.");
      return;
    }
    setEditForm({
      name: student.name, nickname: student.nickname ?? "",
      dateOfBirth: student.dateOfBirth ?? "", gender: student.gender ?? "",
      address: student.address ?? "", notes: student.notes ?? "",
      nis: student.nis ?? "", nisn: student.nisn ?? "", birthPlace: student.birthPlace ?? "",
      nik: student.nik ?? "", kkNumber: student.kkNumber ?? "", livingWith: student.livingWith ?? "",
    });
    setIsEditing(true);
    setSectionOpen(SECTION_DATA_ANAK, true);
  }

  async function saveStudent() {
    if (!editForm.name.trim()) { toast.error("Nama wajib diisi"); return; }
    setSavingStudent(true);
    const res = await fetch(`/api/students/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    if (res.ok) { toast.success("Data siswa diperbarui"); setIsEditing(false); fetchStudent(); }
    else { const d = await res.json(); toast.error(d.error || "Gagal menyimpan"); }
    setSavingStudent(false);
  }

  // --- Photo upload ---
  async function handlePhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset the input so re-selecting the same file fires onChange again.
    e.target.value = "";
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Ukuran foto maksimal 2 MB");
      return;
    }
    if (file.type !== "image/jpeg" && file.type !== "image/png") {
      toast.error("Format foto harus JPG atau PNG");
      return;
    }
    setUploadingPhoto(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch(`/api/students/${id}/photo`, { method: "POST", body: fd });
      if (res.ok) {
        toast.success("Foto diperbarui");
        setPhotoVersion((v) => v + 1);
        fetchStudent();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "Gagal mengunggah foto");
      }
    } catch {
      toast.error("Terjadi kesalahan jaringan");
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handlePhotoDelete() {
    setUploadingPhoto(true);
    try {
      const res = await fetch(`/api/students/${id}/photo`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Foto dihapus");
        setPhotoVersion((v) => v + 1);
        fetchStudent();
      } else {
        toast.error("Gagal menghapus foto");
      }
    } catch {
      toast.error("Terjadi kesalahan jaringan");
    } finally {
      setUploadingPhoto(false);
    }
  }

  // --- Metadata persistence ---
  /**
   * Single writer for `Student.metadata`. Both editors (the typed health block
   * and the free-form key/value rows) funnel through here with the *whole*
   * three-bucket state, so saving one can never drop the other — or the
   * machine-owned keys neither of them renders.
   */
  async function persistMetadata(next: {
    known: Record<string, string>;
    extra: MetadataExtraRow[];
  }): Promise<boolean> {
    const payload = buildStudentMetadata({
      known: next.known,
      extra: next.extra,
      system: metaSystem,
    });
    try {
      const res = await fetch(`/api/students/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metadata: payload }),
      });
      if (res.ok) return true;
      const d = await res.json().catch(() => ({}));
      toast.error(d.error || "Gagal menyimpan");
      return false;
    } catch {
      toast.error("Terjadi kesalahan jaringan");
      return false;
    }
  }

  const currentExtraRows = (): MetadataExtraRow[] =>
    metadataRows.map((r) => ({ key: r.key, value: r.value }));

  // --- Kesehatan & Kelahiran (edit-in-place) ---
  function startEditingHealth() {
    setHealthDraft(metaKnown);
    setEditingHealth(true);
    setSectionOpen(SECTION_KESEHATAN, true);
  }

  async function saveHealth() {
    setSavingHealth(true);
    const ok = await persistMetadata({ known: healthDraft, extra: currentExtraRows() });
    if (ok) {
      toast.success("Data kesehatan diperbarui");
      setEditingHealth(false);
      fetchStudent();
    }
    setSavingHealth(false);
  }

  // --- Free-form metadata editor ---
  function addMetadataRow() {
    setMetadataRows((rows) => [...rows, { id: nextMetadataRowId(), key: "", value: "" }]);
    setMetadataDirty(true);
  }
  function updateMetadataRow(rowId: string, patch: Partial<MetadataRow>) {
    setMetadataRows((rows) => rows.map((r) => (r.id === rowId ? { ...r, ...patch } : r)));
    setMetadataDirty(true);
  }
  function removeMetadataRow(rowId: string) {
    setMetadataRows((rows) => rows.filter((r) => r.id !== rowId));
    setMetadataDirty(true);
  }
  async function saveMetadata() {
    const trimmed = metadataRows.map((r) => ({ key: r.key.trim(), value: r.value }));
    if (trimmed.some((r) => r.key === "")) {
      toast.error("Nama field tidak boleh kosong");
      return;
    }
    const keys = trimmed.map((r) => r.key);
    if (new Set(keys).size !== keys.length) {
      toast.error("Nama field harus unik");
      return;
    }
    setSavingMetadata(true);
    const ok = await persistMetadata({ known: metaKnown, extra: trimmed });
    if (ok) {
      toast.success("Informasi tambahan disimpan");
      fetchStudent();
    }
    setSavingMetadata(false);
  }

  // --- Lifecycle inline edit (T5) ---
  async function saveWithdrawalReason() {
    const trimmed = withdrawalEditValue.trim();
    if (!trimmed) {
      toast.error("Alasan tidak boleh kosong");
      return;
    }
    setSavingWithdrawalReason(true);
    try {
      const res = await fetch(`/api/students/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ withdrawalReason: trimmed }),
      });
      if (res.ok) {
        toast.success("Alasan diperbarui");
        setEditingWithdrawalReason(false);
        fetchStudent();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "Gagal menyimpan");
      }
    } catch {
      toast.error("Terjadi kesalahan jaringan");
    } finally {
      setSavingWithdrawalReason(false);
    }
  }

  // --- Guardian CRUD ---
  function openAddGuardian() {
    setEditingGuardian(null);
    setGuardianForm(EMPTY_GUARDIAN_FORM);
    // Search-first: most "new" wali are a sibling's parent already on file.
    setGuardianStep("link");
    setPickedParent(null);
    setLinkRelationship("IBU");
    setLinkChildOrder("");
    setCandidates([]);
    setGuardianDialog(true);
  }

  // useCallback + a memoised card: the dossier renders a much bigger tree than
  // the old tab layout, so every page-level state change (typing a reason into
  // the enroll dialog, for instance) used to re-render every wali card. Stable
  // handlers are what let React.memo actually skip that work.
  const openEditGuardian = useCallback((g: Guardian) => {
    setEditingGuardian(g);
    setGuardianForm({
      name: g.parent.name,
      relationship: g.relationship,
      phone: g.parent.phone ?? "",
      whatsapp: g.parent.whatsapp ?? "",
      email: g.parent.email ?? "",
      parentNik: g.parent.nik ?? "",
      education: g.parent.education ?? "",
      occupation: g.parent.occupation ?? "",
      incomeRange: g.parent.incomeRange ?? "",
      employer: g.parent.employer ?? "",
      employerAddress: g.parent.employerAddress ?? "",
      employerCity: g.parent.employerCity ?? "",
      childrenTotal: g.parent.childrenTotal != null ? String(g.parent.childrenTotal) : "",
      address: g.parent.address ?? "",
      childOrder: g.childOrder != null ? String(g.childOrder) : "",
      isPrimary: g.isPrimary,
    });
    setGuardianDialog(true);
  }, []);

  async function saveGuardian() {
    if (!guardianForm.name.trim()) { toast.error("Nama wali wajib diisi"); return; }
    setSavingGuardian(true);
    const url = editingGuardian ? `/api/students/${id}/guardians/${editingGuardian.id}` : `/api/students/${id}/guardians`;
    const method = editingGuardian ? "PUT" : "POST";
    // childrenTotal is a string in the form (Input value) but the schema
    // coerces — send "" as null so the schema's optional/nullable path fires
    // rather than coercing the empty string to NaN.
    const payload: Record<string, unknown> = { ...guardianForm };
    if (payload.childrenTotal === "") payload.childrenTotal = null;
    else payload.childrenTotal = Number(payload.childrenTotal);
    // T8: same coercion for childOrder. Empty → null clears the column;
    // non-empty → number for the z.coerce.number().int() schema.
    if (payload.childOrder === "") payload.childOrder = null;
    else payload.childOrder = Number(payload.childOrder);
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (res.ok) { toast.success(editingGuardian ? "Data wali diperbarui" : "Wali ditambahkan"); setGuardianDialog(false); fetchStudent(); }
    else { const d = await res.json(); toast.error(d.error || "Gagal"); }
    setSavingGuardian(false);
  }

  // --- Tambah Wali: link an existing parent ---
  async function linkExistingParent(parentId: string) {
    setSavingGuardian(true);
    try {
      const res = await fetch(`/api/students/${id}/guardians`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentId,
          relationship: linkRelationship,
          childOrder: linkChildOrder === "" ? null : Number(linkChildOrder),
        }),
      });
      if (res.ok) {
        toast.success("Wali ditautkan");
        setGuardianDialog(false);
        fetchStudent();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "Gagal menautkan wali");
      }
    } catch {
      toast.error("Terjadi kesalahan jaringan");
    } finally {
      setSavingGuardian(false);
    }
  }

  /**
   * Create path. The server answers 409 PARENT_CANDIDATES when the typed
   * name / phone / NIK / email already matches a wali on file; that is not an
   * error to toast away but a decision to put in front of the admin, so it
   * switches the overlay to the candidates step. `confirmNew` is the
   * "I looked, create anyway" escape.
   */
  async function createNewParent(confirmNew: boolean) {
    if (!guardianForm.name.trim()) { toast.error("Nama wali wajib diisi"); return; }
    setSavingGuardian(true);
    try {
      const payload: Record<string, unknown> = { ...guardianForm, confirmNew };
      payload.childrenTotal = guardianForm.childrenTotal === "" ? null : Number(guardianForm.childrenTotal);
      payload.childOrder = guardianForm.childOrder === "" ? null : Number(guardianForm.childOrder);

      const res = await fetch(`/api/students/${id}/guardians`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        toast.success("Wali ditambahkan");
        setGuardianDialog(false);
        fetchStudent();
        return;
      }
      const d = await res.json().catch(() => ({}));
      if (res.status === 409 && d.code === "PARENT_CANDIDATES") {
        setCandidates(d.candidates ?? []);
        // Carry the relationship/urutan the admin already typed so choosing
        // "Tautkan" here doesn't silently fall back to the link-step defaults.
        setLinkRelationship(guardianForm.relationship || "IBU");
        setLinkChildOrder(guardianForm.childOrder ?? "");
        // Focus moves to the advisory in the effect above, matching the enroll
        // dialog's 409 handling.
        setGuardianStep("candidates");
        return;
      }
      toast.error(d.error || "Gagal menambahkan wali");
    } catch {
      toast.error("Terjadi kesalahan jaringan");
    } finally {
      setSavingGuardian(false);
    }
  }

  async function deactivateGuardian() {
    if (!deleteGuardianTarget) return;
    const newStatus = deleteGuardianTarget.status === "INACTIVE" ? "ACTIVE" : "INACTIVE";
    const res = await fetch(`/api/guardians/${deleteGuardianTarget.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      toast.success(newStatus === "INACTIVE" ? "Wali dinonaktifkan" : "Wali diaktifkan kembali");
      setDeleteGuardianTarget(null);
      fetchStudent();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Gagal mengubah status wali");
    }
  }

  // --- Promote (Naik Kelas) ---
  async function openPromoteDialog() {
    try {
      // Same year scoping as Enroll — see comment there.
      const res = await fetch("/api/class-sections?yearStatus=ACTIVE,PLANNING");
      if (!res.ok) { toast.error("Gagal memuat data kelas"); return; }
      setSections(await res.json());
      setPromoteTarget("");
      setPromoteNotes("");
      setPromoteDialog(true);
    } catch { toast.error("Terjadi kesalahan"); }
  }

  async function handlePromote() {
    if (!promoteTarget) { toast.error("Pilih kelas tujuan"); return; }
    setPromoting(true);
    try {
      const res = await fetch(`/api/students/${id}/promote`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetClassSectionId: promoteTarget, notes: promoteNotes }),
      });
      if (res.ok) { toast.success("Naik kelas"); setPromoteDialog(false); fetchStudent(); }
      else { const d = await res.json(); toast.error(d.error || "Gagal naik kelas"); }
    } catch { toast.error("Terjadi kesalahan"); }
    setPromoting(false);
  }

  // --- Graduate (Luluskan) ---
  async function handleGraduate() {
    setGraduating(true);
    try {
      const res = await fetch(`/api/students/${id}/graduate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) { toast.success("Diluluskan"); setGraduateOpen(false); fetchStudent(); }
      else { const d = await res.json(); toast.error(d.error || "Gagal meluluskan"); }
    } catch { toast.error("Terjadi kesalahan"); }
    setGraduating(false);
  }

  // --- Withdraw (Keluarkan) ---
  async function handleWithdraw() {
    if (!withdrawReason.trim()) { toast.error("Alasan wajib diisi"); throw new Error("reason-required"); }
    setWithdrawing(true);
    try {
      const res = await fetch(`/api/students/${id}/withdraw`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: withdrawReason }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.unpaidInvoiceCount > 0) {
          toast.success(`Siswa dikeluarkan. Perhatian: ${data.unpaidInvoiceCount} tagihan belum lunas.`);
        } else {
          toast.success("Dikeluarkan");
        }
        setWithdrawDialog(false);
        setWithdrawReason("");
        fetchStudent();
      } else {
        const d = await res.json();
        toast.error(d.error || "Gagal mengeluarkan siswa");
      }
    } catch { toast.error("Terjadi kesalahan"); }
    setWithdrawing(false);
  }

  if (loading) return <DetailPageSkeleton />;
  if (!student) return <EmptyState title="Siswa tidak ditemukan" description="Data siswa tidak tersedia atau telah dihapus." />;

  // A student can hold a school (SEMESTER) and a day-care (YEAR_ROUND)
  // enrollment at once, and many carry a stale ACTIVE row in an archived
  // year. The API returns enrollments newest-first, so `.find(ACTIVE)` used
  // to surface whichever was created last — after enrolling into day care
  // the header announced the day-care class as the child's placement.
  // Primary (school) first, then any other current placement, matching the
  // students list. The Riwayat Kelas section below still lists every row.
  const currentEnrollments = student.enrollments.filter(
    e => e.status === "ACTIVE" && e.classSection.academicYear.status !== "ARCHIVED",
  );
  const primaryEnrollment = pickPrimaryEnrollment(currentEnrollments);
  const orderedEnrollments = primaryEnrollment
    ? [primaryEnrollment, ...currentEnrollments.filter(e => e.id !== primaryEnrollment.id)]
    : [];
  const activeEnrollment = primaryEnrollment;

  const activeGuardians = student.guardians.filter((g) => g.status !== "INACTIVE");
  const siblings = deriveSiblings(student.guardians, student.id);
  const parsedMetadata = parseStudentMetadata(student.metadata);
  const flags = healthFlags(parsedMetadata);
  const age = formatAgeShort(student.dateOfBirth);
  const lifecycleShown = student.status === "WITHDRAWN" || student.status === "GRADUATED";

  // Earliest enrollment = when this child actually joined the school. Plain
  // string compare is safe: the column is YYYY-MM-DD.
  const joinedDate = student.enrollments.reduce<string | null>(
    (min, e) => (e.enrollDate && (!min || e.enrollDate < min) ? e.enrollDate : min),
    null,
  );

  // KK is a per-family document — resolve it through the primary wali, falling
  // back to the first active one.
  const kkGuardian = activeGuardians.find((g) => g.isPrimary) ?? activeGuardians[0] ?? null;
  const kkUrl = kkGuardian?.parent.kkUrl ?? null;
  const contactGuardian = kkGuardian;

  // Presence only — this is "is the file on record", not a required-documents
  // policy. The school has not defined one, so nothing here is called missing.
  const docItems = [
    { label: "Foto siswa", present: !!student.photoUrl },
    { label: "KK keluarga", present: !!kkUrl },
    ...activeGuardians.map((g) => ({
      label: `KTP ${g.parent.name}`,
      present: !!g.parent.ktpUrl,
    })),
    // Only for a student who came from the form. A hand-entered student never
    // had a consent letter to sign, so listing it as missing would invent a gap.
    ...(overview?.enrollmentApplication
      ? [{ label: "Surat persetujuan", present: overview.documents?.consent === true }]
      : []),
  ];
  const docsPresent = docItems.filter((d) => d.present).length;

  // Increment 3 additions, all read off the one aggregate fetch.
  // Optional-chained all the way down: a 200 with an unexpected body (a proxy
  // error page, a future field rename) must degrade to the same dash the
  // failure path shows, not throw the whole dossier away.
  const application = overview?.enrollmentApplication ?? null;
  const attendanceCounts = overview?.attendance?.counts ?? null;
  const raportTally = overview?.raport ?? null;
  // The class the raport deep link should preselect. Primary (school) placement
  // rather than a day-care row — raport is a school-programme artefact.
  const primaryClassSectionId = primaryEnrollment?.classSection.id ?? null;

  // Summary over whatever the invoice fetch returned. Until it lands, the
  // empty summary reads as zero everywhere — which is why the Tunggakan tile
  // below distinguishes "not loaded yet" from "nothing owed".
  const invoiceSummary = invoices ? summarizeStudentInvoices(invoices) : EMPTY_INVOICE_SUMMARY;
  const invoicesLoading = invoices === null && !invoicesError;

  const navSections: DossierSectionDef[] = [
    { id: SECTION_DATA_ANAK, label: "Data Anak" },
    { id: SECTION_KESEHATAN, label: "Kesehatan & Kelahiran" },
    { id: SECTION_KELUARGA, label: "Keluarga & Wali" },
    { id: SECTION_RIWAYAT_KELAS, label: "Riwayat Kelas" },
    { id: SECTION_KEHADIRAN, label: "Kehadiran" },
    { id: SECTION_KEUANGAN, label: "Keuangan" },
    { id: SECTION_KERINGANAN, label: "Keringanan" },
    { id: SECTION_JURNAL, label: "Buku Penghubung" },
    { id: SECTION_AKADEMIK, label: "Akademik" },
    // Listed only when the student actually came from a pendaftaran form —
    // a nav entry that scrolls to nothing is worse than no entry.
    ...(application ? [{ id: SECTION_PENDAFTARAN, label: "Pendaftaran" }] : []),
    { id: SECTION_DOKUMEN, label: "Dokumen" },
    ...(lifecycleShown ? [{ id: SECTION_STATUS, label: "Riwayat Status" }] : []),
    { id: SECTION_TAMBAHAN, label: "Informasi Tambahan" },
  ];

  const statTiles = [
    { label: "Usia", value: age ?? "—", hint: student.dateOfBirth ? formatDateShort(student.dateOfBirth) : undefined },
    { label: "Kelas Aktif", value: currentEnrollments.length, hint: currentEnrollments.length > 1 ? "sekolah + day care" : undefined },
    { label: "Wali Aktif", value: activeGuardians.length, hint: siblings.length > 0 ? `${siblings.length} saudara` : undefined },
    {
      label: "Berkas",
      value: `${docsPresent}/${docItems.length}`,
      tone: (docsPresent < docItems.length ? "warning" : "positive") as "warning" | "positive",
    },
    // Kehadiran and Raport are the two tiles increments 1 and 2 left out rather
    // than ship blank. They read the aggregate route, so neither costs a row
    // dump — and both distinguish "not loaded" from a real zero.
    {
      label: "Hadir Bln Ini",
      value: overviewError ? (
        <span className="text-muted-foreground">—</span>
      ) : !attendanceCounts ? (
        <span className="text-muted-foreground">Memuat…</span>
      ) : attendanceCounts.total === 0 ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        `${attendanceCounts.present}/${attendanceCounts.total}`
      ),
      tone: (attendanceCounts && attendanceCounts.total > 0 && attendanceCounts.absent > 0
        ? "warning"
        : "default") as "warning" | "default",
      hint:
        !attendanceCounts || overviewError
          ? undefined
          : attendanceCounts.total === 0
            ? "Belum ada absensi bulan ini"
            : [
                attendanceCounts.absent > 0 ? `${attendanceCounts.absent} alpa` : null,
                attendanceCounts.sick > 0 ? `${attendanceCounts.sick} sakit` : null,
                attendanceCounts.permission > 0 ? `${attendanceCounts.permission} izin` : null,
              ]
                .filter(Boolean)
                .join(" · ") || "Hadir penuh",
    },
    {
      label: "Raport",
      value: overviewError ? (
        <span className="text-muted-foreground">—</span>
      ) : !raportTally ? (
        <span className="text-muted-foreground">Memuat…</span>
      ) : raportTally.total === 0 ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        `${raportTally.published}/${raportTally.total}`
      ),
      tone: "default" as const,
      hint:
        !raportTally || overviewError
          ? undefined
          : raportTally.total === 0
            ? "Triwulan belum dibuat"
            : raportTally.draft > 0
              ? `${raportTally.draft} draf`
              : raportTally.published === 0
                ? // Found in smoke: with 0 published and 0 draft this said
                  // "terbit", which reads as though a raport had been issued.
                  "Belum ada raport"
                : "semua terbit",
    },
    // Real figure or an honest dash — never a zero that could mean either
    // "paid up" or "we could not load it".
    {
      label: "Tunggakan",
      wide: true,
      value: invoicesLoading ? (
        <span className="text-muted-foreground">Memuat…</span>
      ) : invoicesError ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <span className="font-currency">{formatRupiah(invoiceSummary.outstanding)}</span>
      ),
      tone: (invoiceSummary.outstanding > 0 ? "critical" : "positive") as "critical" | "positive",
      hint: invoicesLoading || invoicesError
        ? undefined
        : invoiceSummary.unpaidCount > 0
          ? `${invoiceSummary.unpaidCount} tagihan belum lunas${
              invoiceSummary.nearestDue ? ` · ${formatDateShort(invoiceSummary.nearestDue)}` : ""
            }`
          : "Lunas semua",
    },
  ];

  const summaryItems = [
    { label: "Status", value: <StatusBadge status={student.status} /> },
    ...(primaryEnrollment
      ? [{ label: "Kelas utama", value: `${primaryEnrollment.classSection.name}` }]
      : []),
    ...(orderedEnrollments.slice(1).map((e) => ({
      label: e.classSection.program.name,
      value: e.classSection.name,
    }))),
    ...(primaryEnrollment
      ? [{ label: "Tahun ajaran", value: primaryEnrollment.classSection.academicYear.name }]
      : []),
    ...(primaryEnrollment
      ? [{ label: "Kampus", value: primaryEnrollment.classSection.campus.name }]
      : []),
    ...(joinedDate ? [{ label: "Masuk sejak", value: formatDateShort(joinedDate) }] : []),
    ...(student.nis ? [{ label: "NIS", value: <span className="font-currency">{student.nis}</span> }] : []),
  ];

  const headerActions = (
    <>
      {!isEditing && (
        <Button size="sm" variant="outline" onClick={startEditing}>
          <Pencil size={14} className="mr-1" aria-hidden="true" /> Edit
        </Button>
      )}
      <Button size="sm" variant="outline" onClick={() => setEnrollDialog(true)}>
        <Plus size={14} className="mr-1" aria-hidden="true" /> Daftarkan ke Kelas
      </Button>
      {student.status === "ACTIVE" && activeEnrollment && (
        <Button size="sm" variant="outline" onClick={openPromoteDialog}>
          <GraduationCap size={14} className="mr-1" aria-hidden="true" /> Naik Kelas
        </Button>
      )}
      {student.status === "ACTIVE" && (
        <Button size="sm" variant="outline" onClick={() => setGraduateOpen(true)}>
          Luluskan
        </Button>
      )}
      {student.status === "ACTIVE" && (
        <Button size="sm" variant="outline" onClick={() => setWithdrawDialog(true)} className="text-destructive hover:text-destructive">
          Keluarkan
        </Button>
      )}
    </>
  );

  // Five buttons wrap to three rows at 375px and push the whole page down.
  // Collapse everything except the primary action into a menu on mobile.
  const mobileActions = (
    <>
      {!isEditing && (
        <Button size="sm" variant="outline" onClick={startEditing}>
          <Pencil size={14} className="mr-1" aria-hidden="true" /> Edit
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button size="sm" variant="outline" aria-label="Aksi lain" />}>
          <MoreHorizontal size={14} aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEnrollDialog(true)}>Daftarkan ke Kelas</DropdownMenuItem>
          {student.status === "ACTIVE" && activeEnrollment && (
            <DropdownMenuItem onClick={openPromoteDialog}>Naik Kelas</DropdownMenuItem>
          )}
          {student.status === "ACTIVE" && (
            <DropdownMenuItem onClick={() => setGraduateOpen(true)}>Luluskan</DropdownMenuItem>
          )}
          {student.status === "ACTIVE" && (
            <DropdownMenuItem variant="destructive" onClick={() => setWithdrawDialog(true)}>
              Keluarkan
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );

  const railContent = (
    <>
      <RailStatTiles tiles={statTiles} />
      <RailCard title="Ringkasan">
        <RailKV items={summaryItems} />
      </RailCard>
      {contactGuardian && (
        <RailCard title="Kontak Cepat">
          <p className="text-small font-semibold">{contactGuardian.parent.name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {REL_LABELS[contactGuardian.relationship] ?? contactGuardian.relationship}
            {contactGuardian.parent.phone ? ` · ${contactGuardian.parent.phone}` : ""}
          </p>
          <div className="mt-3 flex gap-2">
            {whatsappHref(contactGuardian.parent.whatsapp ?? contactGuardian.parent.phone) && (
              <Button
                size="sm"
                className="flex-1"
                render={
                  <a
                    href={whatsappHref(contactGuardian.parent.whatsapp ?? contactGuardian.parent.phone)!}
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                }
              >
                WhatsApp
              </Button>
            )}
            {telHref(contactGuardian.parent.phone) && (
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                render={<a href={telHref(contactGuardian.parent.phone)!} />}
              >
                Telepon
              </Button>
            )}
          </div>
        </RailCard>
      )}
      <RailCard title="Kelengkapan Berkas">
        <RailChecklist items={docItems} />
      </RailCard>
      <RailCard title="Jejak">
        <RailKV
          items={[
            ...(student.createdAt
              ? [{ label: "Dibuat", value: formatDateShort(student.createdAt.slice(0, 10)) }]
              : []),
            {
              label: "Asal data",
              value: metaSystem.fromEnrollmentApplication ? (
                <Link
                  href={`/admin/enrollments/${metaSystem.fromEnrollmentApplication}`}
                  className="text-primary-text hover:underline"
                >
                  Formulir pendaftaran →
                </Link>
              ) : (
                <span className="text-muted-foreground">Input manual</span>
              ),
            },
          ]}
        />
      </RailCard>
    </>
  );

  return (
    <>
      <DetailPageHeader
        backHref="/admin/students"
        backLabel="Kembali ke Daftar Siswa"
        title={student.name}
        description={
          [
            student.nickname,
            age,
            orderedEnrollments.length > 0
              ? orderedEnrollments.map(e => `${e.classSection.program.name} · ${e.classSection.name}`).join(" + ")
              : "Belum terdaftar di kelas",
          ]
            .filter(Boolean)
            .join(" · ")
        }
        badge={
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge status={student.status} />
            {/* Allergy and illness ride in the header, not three sections down:
                they are the one fact a teacher or admin must not have to hunt for. */}
            {flags.allergy && (
              <Badge className="bg-status-leave-subtle text-status-leave-text text-xs">
                Alergi: {flags.allergy}
              </Badge>
            )}
            {flags.illness && (
              <Badge className="bg-status-leave-subtle text-status-leave-text text-xs">
                Riwayat: {flags.illness}
              </Badge>
            )}
          </div>
        }
        actions={isMobile ? mobileActions : headerActions}
      />

      {/* Mobile: the rail's numbers move above the sections so the first
          viewport still answers "who is this child". */}
      {isMobile && <div className="mb-4"><RailStatTiles tiles={statTiles} /></div>}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <DossierNav sections={navSections} onJump={jumpToSection} />

          {/* ---------- Data Anak ---------- */}
          <DossierSection
            id={SECTION_DATA_ANAK}
            label="Data Anak"
            open={openSections[SECTION_DATA_ANAK] ?? true}
            onOpenChange={(o) => handleSectionOpenChange(SECTION_DATA_ANAK, o)}
            actions={
              isEditing ? (
                <>
                  <Button size="sm" variant="outline" onClick={() => setIsEditing(false)} disabled={savingStudent}>
                    <X size={14} className="mr-1" aria-hidden="true" /> Batal
                  </Button>
                  <Button size="sm" onClick={saveStudent} disabled={savingStudent}>
                    <Save size={14} className="mr-1" aria-hidden="true" /> {savingStudent ? "Menyimpan..." : "Simpan Perubahan"}
                  </Button>
                </>
              ) : undefined
            }
          >
            {/* Photo — auth-proxied; src never references a public filesystem path */}
            <div className="mb-4 flex items-center gap-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted">
                {student.photoUrl ? (
                  <img
                    src={`/api/students/${student.id}/photo?v=${photoVersion}`}
                    alt={`Foto ${student.name}`}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <span className="text-xl font-bold text-primary">{student.name[0]}</span>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/jpeg,image/png"
                  className="hidden"
                  onChange={handlePhotoFile}
                />
                <Button size="sm" variant="outline" onClick={() => photoInputRef.current?.click()} disabled={uploadingPhoto}>
                  {uploadingPhoto ? "Mengunggah..." : "Ganti Foto"}
                </Button>
                {student.photoUrl && (
                  <Button size="sm" variant="ghost" onClick={handlePhotoDelete} disabled={uploadingPhoto}>
                    Hapus
                  </Button>
                )}
              </div>
            </div>

            {isEditing ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field><FieldLabel htmlFor="student-detail-name">Nama Lengkap</FieldLabel><Input id="student-detail-name" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} /></Field>
                <Field><FieldLabel htmlFor="student-detail-nickname">Nama Panggilan</FieldLabel><Input id="student-detail-nickname" value={editForm.nickname} onChange={e => setEditForm({ ...editForm, nickname: e.target.value })} /></Field>
                <Field><FieldLabel htmlFor="student-detail-dob">Tanggal Lahir</FieldLabel><Input id="student-detail-dob" type="date" value={editForm.dateOfBirth} onChange={e => setEditForm({ ...editForm, dateOfBirth: e.target.value })} /></Field>
                <Field>
                  <FieldLabel htmlFor="student-detail-gender">Jenis Kelamin</FieldLabel>
                  <Select value={editForm.gender || undefined} onValueChange={v => v && setEditForm({ ...editForm, gender: v })} items={{ L: "Laki-laki", P: "Perempuan" }}>
                    <SelectTrigger id="student-detail-gender"><SelectValue placeholder="Pilih" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="L">Laki-laki</SelectItem>
                      <SelectItem value="P">Perempuan</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field className="sm:col-span-2"><FieldLabel htmlFor="student-detail-address">Alamat</FieldLabel><Textarea id="student-detail-address" value={editForm.address} onChange={e => setEditForm({ ...editForm, address: e.target.value })} rows={2} /></Field>
                <Field className="sm:col-span-2"><FieldLabel htmlFor="student-detail-notes">Catatan</FieldLabel><Textarea id="student-detail-notes" value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} rows={2} /></Field>

                <div className="mt-2 sm:col-span-2"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Identitas Resmi</p></div>
                <Field><FieldLabel htmlFor="student-detail-nis">NIS</FieldLabel><Input id="student-detail-nis" value={editForm.nis} onChange={e => setEditForm({ ...editForm, nis: e.target.value })} placeholder="Nomor Induk Siswa" /></Field>
                <Field><FieldLabel htmlFor="student-detail-nisn">NISN</FieldLabel><Input id="student-detail-nisn" value={editForm.nisn} onChange={e => setEditForm({ ...editForm, nisn: e.target.value })} placeholder="Nomor Induk Siswa Nasional" /></Field>
                <Field><FieldLabel htmlFor="student-detail-birth-place">Tempat Lahir</FieldLabel><Input id="student-detail-birth-place" value={editForm.birthPlace} onChange={e => setEditForm({ ...editForm, birthPlace: e.target.value })} placeholder="Kota kelahiran" /></Field>
                <Field><FieldLabel htmlFor="student-detail-nik">NIK</FieldLabel><Input id="student-detail-nik" value={editForm.nik} onChange={e => setEditForm({ ...editForm, nik: e.target.value })} placeholder="Nomor Induk Kependudukan" /></Field>
                <Field><FieldLabel htmlFor="student-detail-kk-number">No. KK</FieldLabel><Input id="student-detail-kk-number" value={editForm.kkNumber} onChange={e => setEditForm({ ...editForm, kkNumber: e.target.value })} placeholder="Nomor Kartu Keluarga" /></Field>
                <Field>
                  <FieldLabel htmlFor="student-detail-living-with">Tinggal Dengan</FieldLabel>
                  <Select value={editForm.livingWith || undefined} onValueChange={v => v && setEditForm({ ...editForm, livingWith: v })} items={LIVING_WITH_LABELS}>
                    <SelectTrigger id="student-detail-living-with"><SelectValue placeholder="Pilih" /></SelectTrigger>
                    <SelectContent>
                      {LIVING_WITH_OPTIONS.map(o => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <div className="flex items-center gap-3">
                    <User size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                    <div><p className="text-xs text-muted-foreground">Nama Lengkap</p><p className="text-sm font-medium">{student.name}</p></div>
                  </div>
                  {student.nickname && <div><p className="text-xs text-muted-foreground">Nama Panggilan</p><p className="text-sm font-medium">{student.nickname}</p></div>}
                  {student.dateOfBirth && <div><p className="text-xs text-muted-foreground">Tanggal Lahir</p><p className="text-sm font-medium">{formatDateShort(student.dateOfBirth)}{age ? ` · ${age}` : ""}</p></div>}
                  {student.gender && <div><p className="text-xs text-muted-foreground">Jenis Kelamin</p><p className="text-sm font-medium">{student.gender === "L" ? "Laki-laki" : student.gender === "P" ? "Perempuan" : "—"}</p></div>}
                  {student.address && (
                    <div className="col-span-2 flex items-start gap-3 sm:col-span-3">
                      <MapPin size={16} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <div><p className="text-xs text-muted-foreground">Alamat</p><p className="text-sm">{student.address}</p></div>
                    </div>
                  )}
                  {student.notes && <div className="col-span-2 sm:col-span-3"><p className="text-xs text-muted-foreground">Catatan</p><p className="text-sm">{student.notes}</p></div>}
                </div>

                {(student.nis || student.nisn || student.nik || student.birthPlace || student.kkNumber || student.livingWith) && (
                  <>
                    <div className="mt-6"><SectionHeading label="Identitas Resmi" /></div>
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                      {student.nis && <div><p className="text-xs text-muted-foreground">NIS</p><p className="font-currency text-sm font-medium">{student.nis}</p></div>}
                      {student.nisn && <div><p className="text-xs text-muted-foreground">NISN</p><p className="font-currency text-sm font-medium">{student.nisn}</p></div>}
                      {student.birthPlace && <div><p className="text-xs text-muted-foreground">Tempat Lahir</p><p className="text-sm">{student.birthPlace}</p></div>}
                      {/* NIK and No. KK are specific personal data under UU PDP
                          27/2022 — masked by default now that they share a
                          screen with every other family document. */}
                      {student.nik && <div><p className="text-xs text-muted-foreground">NIK</p><div className="text-sm"><MaskedValue value={student.nik} label="NIK siswa" /></div></div>}
                      {student.kkNumber && <div><p className="text-xs text-muted-foreground">No. KK</p><div className="text-sm"><MaskedValue value={student.kkNumber} label="No. KK" /></div></div>}
                      {student.livingWith && <div><p className="text-xs text-muted-foreground">Tinggal Dengan</p><p className="text-sm">{LIVING_WITH_LABELS[student.livingWith] ?? student.livingWith}</p></div>}
                    </div>
                  </>
                )}
              </>
            )}
          </DossierSection>

          {/* ---------- Kesehatan & Kelahiran ---------- */}
          <DossierSection
            id={SECTION_KESEHATAN}
            label="Kesehatan & Kelahiran"
            badge={
              flags.allergy ? (
                <Badge className="bg-status-leave-subtle text-status-leave-text text-xs">Ada alergi</Badge>
              ) : undefined
            }
            open={openSections[SECTION_KESEHATAN] ?? true}
            onOpenChange={(o) => handleSectionOpenChange(SECTION_KESEHATAN, o)}
            actions={
              editingHealth ? (
                <>
                  <Button size="sm" variant="outline" onClick={() => { setEditingHealth(false); setHealthDraft(metaKnown); }} disabled={savingHealth}>
                    <X size={14} className="mr-1" aria-hidden="true" /> Batal
                  </Button>
                  <Button size="sm" onClick={saveHealth} disabled={savingHealth}>
                    <Save size={14} className="mr-1" aria-hidden="true" /> {savingHealth ? "Menyimpan..." : "Simpan"}
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="ghost" onClick={startEditingHealth}>
                  <Pencil size={12} className="mr-1" aria-hidden="true" /> Ubah
                </Button>
              )
            }
          >
            <StudentHealthBlock
              known={editingHealth ? healthDraft : metaKnown}
              system={metaSystem}
              editing={editingHealth}
              onChange={(key, value) => setHealthDraft((d) => ({ ...d, [key]: value }))}
            />
          </DossierSection>

          {/* ---------- Keluarga & Wali ---------- */}
          <DossierSection
            id={SECTION_KELUARGA}
            label="Keluarga & Wali"
            badge={
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {activeGuardians.length} wali{siblings.length > 0 ? ` · ${siblings.length} saudara` : ""}
              </span>
            }
            open={openSections[SECTION_KELUARGA] ?? true}
            onOpenChange={(o) => handleSectionOpenChange(SECTION_KELUARGA, o)}
            actions={
              <Button size="sm" variant="ghost" onClick={openAddGuardian}>
                <Plus size={12} className="mr-1" aria-hidden="true" /> Tambah
              </Button>
            }
          >
            {activeGuardians.length === 0 ? (
              <EmptyState title="Belum ada data wali" description="Tambahkan orang tua atau wali siswa." />
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {activeGuardians.map((g) => (
                  <GuardianDetailCard
                    key={g.id}
                    guardian={g}
                    onEdit={openEditGuardian}
                    onToggleStatus={setDeleteGuardianTarget}
                  />
                ))}
              </div>
            )}

            {/* Saudara — other students sharing at least one ACTIVE guardian.
                Derived from the guardians already loaded rather than a second
                request. Hidden entirely when the student is an only child, so
                the section never renders as a dead empty state. */}
            {siblings.length > 0 && (
              <>
                <div className="mt-6"><SectionHeading label="Saudara" /></div>
                <div className="flex flex-wrap gap-2">
                  {siblings.map((s) => (
                    <Link
                      key={s.id}
                      href={`/admin/students/${s.id}`}
                      className="inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm transition-colors hover:bg-accent/50"
                    >
                      <span>{s.name}</span>
                      <StatusBadge status={s.status} />
                    </Link>
                  ))}
                </div>
              </>
            )}
          </DossierSection>

          {/* ---------- Riwayat Kelas ---------- */}
          <DossierSection
            id={SECTION_RIWAYAT_KELAS}
            label="Riwayat Kelas"
            badge={
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {student.enrollments.length}
              </span>
            }
            open={openSections[SECTION_RIWAYAT_KELAS] ?? true}
            onOpenChange={(o) => handleSectionOpenChange(SECTION_RIWAYAT_KELAS, o)}
          >
            {student.enrollments.length === 0 ? (
              <EmptyState title="Belum terdaftar di kelas" description="Daftarkan siswa ke kelas melalui tombol di atas." />
            ) : (
              <div className="space-y-2">
                {student.enrollments.map(e => (
                  <div key={e.id} className="flex items-center justify-between border-b border-border/50 py-2 last:border-0">
                    <div>
                      <div className="flex items-center gap-2"><GraduationCap size={14} className="text-primary" aria-hidden="true" /><span className="text-sm font-medium">{e.classSection.name}</span></div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{e.classSection.program.name} · {e.classSection.academicYear.name} · {e.classSection.campus.name} · masuk {formatDateShort(e.enrollDate)}</p>
                    </div>
                    <StatusBadge status={e.status} />
                  </div>
                ))}
              </div>
            )}
          </DossierSection>

          {/* ---------- Kehadiran (lazy — opening it triggers the fetch) ---------- */}
          <DossierSection
            id={SECTION_KEHADIRAN}
            label="Kehadiran"
            open={openSections[SECTION_KEHADIRAN] ?? false}
            onOpenChange={(o) => handleSectionOpenChange(SECTION_KEHADIRAN, o)}
            actions={
              <Input
                type="month"
                className="h-8 w-40 text-xs"
                aria-label="Bulan kehadiran"
                value={attendanceMonth}
                onChange={(e) => {
                  setAttendanceMonth(e.target.value);
                  if (e.target.value) {
                    attendanceRequested.current = true;
                    fetchAttendance(e.target.value);
                  }
                }}
              />
            }
          >
            {attendanceSummary && (
              <div className="mb-4 grid grid-cols-4 gap-3">
                <div className="rounded-lg border p-2.5 text-center">
                  <p className="text-lg font-bold text-status-present-text">{attendanceSummary.present}</p>
                  <p className="text-xs text-muted-foreground">Hadir</p>
                </div>
                <div className="rounded-lg border p-2.5 text-center">
                  <p className="text-lg font-bold text-status-absent-text">{attendanceSummary.absent}</p>
                  <p className="text-xs text-muted-foreground">Alpa</p>
                </div>
                <div className="rounded-lg border p-2.5 text-center">
                  <p className="text-lg font-bold text-status-leave-text">{attendanceSummary.sick}</p>
                  <p className="text-xs text-muted-foreground">Sakit</p>
                </div>
                <div className="rounded-lg border p-2.5 text-center">
                  <p className="text-lg font-bold text-status-leave-text">{attendanceSummary.permission}</p>
                  <p className="text-xs text-muted-foreground">Izin</p>
                </div>
              </div>
            )}

            {attendanceLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : attendanceRecords.length === 0 ? (
              <EmptyState title="Belum ada data kehadiran" description="Belum ada rekap kehadiran untuk bulan ini." />
            ) : (
              <div className="space-y-0">
                {attendanceRecords.map((r) => (
                  <div key={r.id} className="flex items-center justify-between border-b border-border/50 py-2.5 last:border-0">
                    <div>
                      <p className="text-sm font-medium">{formatDateShort(r.date)}</p>
                      <p className="text-xs text-muted-foreground">{r.classSection.name}{r.notes ? ` · ${r.notes}` : ""}</p>
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                ))}
              </div>
            )}
          </DossierSection>

          {/* ---------- Keuangan (increment 2) ----------
              Read-only over GET /api/invoices?studentId=. Every write still
              belongs to the Tagihan module, so each row deep-links there. */}
          <DossierSection
            id={SECTION_KEUANGAN}
            label="Keuangan"
            badge={
              invoiceSummary.unpaidCount > 0 ? (
                <Badge className="bg-status-absent-subtle text-status-absent-text text-xs">
                  {invoiceSummary.unpaidCount} belum lunas
                </Badge>
              ) : undefined
            }
            open={openSections[SECTION_KEUANGAN] ?? true}
            onOpenChange={(o) => handleSectionOpenChange(SECTION_KEUANGAN, o)}
          >
            <StudentFinanceBlock
              invoices={invoices ?? []}
              summary={invoiceSummary}
              statusGroups={overview?.finance?.byStatus ?? null}
              loading={invoicesLoading}
              error={invoicesError}
              onRetry={fetchInvoices}
            />
          </DossierSection>

          {/* ---------- Keringanan (increment 2, lazy) ---------- */}
          <DossierSection
            id={SECTION_KERINGANAN}
            label="Keringanan"
            badge={
              keringananCount != null && keringananCount > 0 ? (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {keringananCount}
                </span>
              ) : undefined
            }
            open={openSections[SECTION_KERINGANAN] ?? false}
            onOpenChange={(o) => handleSectionOpenChange(SECTION_KERINGANAN, o)}
            keepMounted
          >
            <StudentKeringananBlock
              studentId={id}
              active={keringananActive}
              onCountChange={setKeringananCount}
            />
          </DossierSection>

          {/* ---------- Buku Penghubung (increment 2, lazy) ---------- */}
          <DossierSection
            id={SECTION_JURNAL}
            label="Buku Penghubung"
            open={openSections[SECTION_JURNAL] ?? false}
            onOpenChange={(o) => handleSectionOpenChange(SECTION_JURNAL, o)}
            keepMounted
          >
            <StudentJournalBlock studentId={id} active={jurnalActive} />
          </DossierSection>

          {/* ---------- Akademik (increment 3, lazy) ----------
              Raport state per triwulan + that term's penilaian coverage, over
              GET /api/students/[id]/academics. Read-only: every row deep-links
              to /admin/raport, which owns the authoring and the publish. */}
          <DossierSection
            id={SECTION_AKADEMIK}
            label="Akademik"
            badge={
              raportTally && raportTally.total > 0 ? (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {raportTally.published}/{raportTally.total} terbit
                </span>
              ) : undefined
            }
            open={openSections[SECTION_AKADEMIK] ?? false}
            onOpenChange={(o) => handleSectionOpenChange(SECTION_AKADEMIK, o)}
            keepMounted
          >
            <StudentAcademicsBlock
              studentId={id}
              classSectionId={primaryClassSectionId}
              active={akademikActive}
            />
          </DossierSection>

          {/* ---------- Pendaftaran (increment 3, lazy) ----------
              The original paper form, read-only. Rendered only for a student
              converted from one — `overview` answers that from the FK, so a
              hand-entered student never sees an empty section. */}
          {application && (
            <DossierSection
              id={SECTION_PENDAFTARAN}
              label="Formulir Pendaftaran"
              badge={
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {application.submittedAt
                    ? formatDateShort(application.submittedAt.slice(0, 10))
                    : "Belum dikirim"}
                </span>
              }
              open={openSections[SECTION_PENDAFTARAN] ?? false}
              onOpenChange={(o) => handleSectionOpenChange(SECTION_PENDAFTARAN, o)}
              keepMounted
            >
              <StudentEnrollmentApplicationBlock studentId={id} active={pendaftaranActive} />
            </DossierSection>
          )}

          {/* ---------- Dokumen Keluarga ----------
              Read-only KK preview resolved via primary guardian: active primary
              → first active fallback → empty-state nudge. Preview src is the
              admin-only auth-proxied endpoint (cookies forwarded by the
              browser); raw filesystem paths NEVER leak to the DOM. */}
          <DossierSection
            id={SECTION_DOKUMEN}
            label="Dokumen Keluarga"
            open={openSections[SECTION_DOKUMEN] ?? true}
            onOpenChange={(o) => handleSectionOpenChange(SECTION_DOKUMEN, o)}
          >
            {!kkGuardian ? (
              <p className="text-sm text-muted-foreground">
                Belum ada wali aktif — tambahkan wali untuk mengunggah KK.
              </p>
            ) : kkUrl ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  KK · {kkGuardian.parent.name}
                  {kkGuardian.isPrimary ? " (wali utama)" : ""}
                </p>
                {/* <embed> handles both image and PDF — browser sniffs the
                    response Content-Type. */}
                <embed
                  src={`/api/parents/${kkGuardian.parent.id}/kk`}
                  className="h-64 w-full max-w-md rounded-lg border bg-muted"
                  aria-label={`KK keluarga ${kkGuardian.parent.name}`}
                />
                <a
                  href={`/api/parents/${kkGuardian.parent.id}/kk`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-sm text-primary-text hover:underline"
                >
                  Buka di tab baru →
                </a>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  KK belum diunggah untuk wali {kkGuardian.parent.name}.
                </p>
                <Link
                  href={`/admin/guardians/${kkGuardian.parent.id}`}
                  className="text-sm text-primary-text hover:underline"
                >
                  Unggah KK di halaman wali →
                </Link>
              </div>
            )}
          </DossierSection>

          {/* ---------- Riwayat Status (T5) ----------
              Read-only context for WITHDRAWN / GRADUATED. Withdrawal reason is
              editable inline; dates are owned by the lifecycle APIs. */}
          {lifecycleShown && (
            <DossierSection
              id={SECTION_STATUS}
              label="Riwayat Status"
              open={openSections[SECTION_STATUS] ?? true}
              onOpenChange={(o) => handleSectionOpenChange(SECTION_STATUS, o)}
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {student.status === "WITHDRAWN" && (
                  <>
                    {student.withdrawalDate && (
                      <div>
                        <p className="text-xs text-muted-foreground">Tanggal Keluar</p>
                        <p className="text-sm font-medium">{formatDateShort(student.withdrawalDate)}</p>
                      </div>
                    )}
                    <div className="sm:col-span-2">
                      <div className="mb-1 flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">Alasan Keluar</p>
                        {!editingWithdrawalReason && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-xs"
                            onClick={() => {
                              setWithdrawalEditValue(student.withdrawalReason ?? "");
                              setEditingWithdrawalReason(true);
                            }}
                          >
                            <Pencil size={11} className="mr-1" aria-hidden="true" /> Ubah
                          </Button>
                        )}
                      </div>
                      {editingWithdrawalReason ? (
                        <div className="space-y-2">
                          <Textarea
                            value={withdrawalEditValue}
                            onChange={(e) => setWithdrawalEditValue(e.target.value)}
                            rows={2}
                            aria-label="Alasan keluar"
                          />
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditingWithdrawalReason(false);
                                setWithdrawalEditValue(student.withdrawalReason ?? "");
                              }}
                              disabled={savingWithdrawalReason}
                            >
                              Batal
                            </Button>
                            <Button size="sm" onClick={saveWithdrawalReason} disabled={savingWithdrawalReason}>
                              {savingWithdrawalReason ? "Menyimpan..." : "Simpan"}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm">{student.withdrawalReason || <span className="text-muted-foreground">—</span>}</p>
                      )}
                    </div>
                  </>
                )}
                {student.status === "GRADUATED" && student.graduationDate && (
                  <div>
                    <p className="text-xs text-muted-foreground">Tanggal Lulus</p>
                    <p className="text-sm font-medium">{formatDateShort(student.graduationDate)}</p>
                  </div>
                )}
              </div>
            </DossierSection>
          )}

          {/* ---------- Informasi Tambahan ----------
              Only the leftovers now: keys with no entry in the metadata
              registry. Everything the enrollment form writes is rendered with a
              real label in Kesehatan & Kelahiran above. */}
          <DossierSection
            id={SECTION_TAMBAHAN}
            label="Informasi Tambahan"
            open={openSections[SECTION_TAMBAHAN] ?? true}
            onOpenChange={(o) => handleSectionOpenChange(SECTION_TAMBAHAN, o)}
            actions={
              <>
                <Button size="sm" variant="ghost" onClick={addMetadataRow}>
                  <Plus size={12} className="mr-1" aria-hidden="true" /> Tambah Field
                </Button>
                {metadataDirty && (
                  <Button size="sm" onClick={saveMetadata} disabled={savingMetadata}>
                    <Save size={12} className="mr-1" aria-hidden="true" /> {savingMetadata ? "Menyimpan..." : "Simpan"}
                  </Button>
                )}
              </>
            }
          >
            {metadataRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada field tambahan. Klik &ldquo;Tambah Field&rdquo; untuk menambahkan.</p>
            ) : (
              <div className="space-y-2">
                {metadataRows.map((row) => (
                  <div key={row.id} className="grid grid-cols-[1fr_2fr_auto] items-start gap-2">
                    <Input
                      value={row.key}
                      onChange={(e) => updateMetadataRow(row.id, { key: e.target.value })}
                      placeholder="Nama field"
                      aria-label="Nama field"
                    />
                    <Input
                      value={row.value}
                      onChange={(e) => updateMetadataRow(row.id, { value: e.target.value })}
                      placeholder="Nilai"
                      aria-label="Nilai field"
                    />
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => removeMetadataRow(row.id)}
                      aria-label={`Hapus field ${row.key || "tanpa nama"}`}
                      className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </DossierSection>
        </div>

        {/* Desktop rail. On mobile the tiles already rendered above and the
            remaining cards fall to the end of the document, after the sections. */}
        {isMobile ? (
          <div className="mt-2 flex flex-col gap-4">
            <RailCard title="Ringkasan"><RailKV items={summaryItems} /></RailCard>
            <RailCard title="Kelengkapan Berkas"><RailChecklist items={docItems} /></RailCard>
          </div>
        ) : (
          <DetailRail>{railContent}</DetailRail>
        )}
      </div>

      {/* ---------- Guardian form (shared via GuardianFormBody) ----------
          Edit keeps the plain form. Add runs three mutually-exclusive steps
          through the same overlay — link → create → (409) candidates —
          mirroring the enroll dialog's picker → advisory shape below. */}
      {(() => {
        const addingGuardian = !editingGuardian;
        const linkedParentIds = student.guardians
          .filter((g) => g.status !== "INACTIVE")
          .map((g) => g.parent.id);

        let guardianBody: React.ReactNode;
        let guardianFooter: React.ReactNode;

        if (addingGuardian && guardianStep === "link") {
          guardianBody = (
            <div className="space-y-field">
              <Field>
                <FieldLabel required htmlFor="guardian-link-parent">Cari Wali</FieldLabel>
                <ParentPicker
                  id="guardian-link-parent"
                  selected={pickedParent}
                  onSelect={setPickedParent}
                  excludeIds={linkedParentIds}
                />
                <FieldDescription>
                  Satu data wali dipakai bersama untuk kakak-adik. Cari dulu sebelum menambah data baru.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel required htmlFor="guardian-link-relationship">Hubungan</FieldLabel>
                <Select value={linkRelationship} onValueChange={(v) => setLinkRelationship(v ?? "IBU")}>
                  <SelectTrigger id="guardian-link-relationship" aria-required="true">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RELATIONSHIP_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="guardian-link-child-order">Anak ke-</FieldLabel>
                <Input
                  id="guardian-link-child-order"
                  type="number"
                  min={1}
                  value={linkChildOrder}
                  onChange={(e) => setLinkChildOrder(e.target.value)}
                  placeholder="Contoh: 2"
                />
                <FieldDescription>Posisi siswa ini di keluarga wali tersebut. Boleh dikosongkan.</FieldDescription>
              </Field>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="px-0 text-primary"
                onClick={() => setGuardianStep("create")}
              >
                Tidak ketemu? Tambah wali baru →
              </Button>
            </div>
          );
          guardianFooter = (
            <>
              <Button variant="ghost" onClick={() => setGuardianDialog(false)} disabled={savingGuardian}>Batal</Button>
              <Button
                onClick={() => pickedParent && linkExistingParent(pickedParent.id)}
                disabled={savingGuardian || !pickedParent}
              >
                {savingGuardian ? "Memproses..." : "Tautkan Wali"}
              </Button>
            </>
          );
        } else if (addingGuardian && guardianStep === "candidates") {
          guardianFooter = (
            <>
              <Button variant="ghost" onClick={() => setGuardianStep("create")} disabled={savingGuardian}>
                Kembali
              </Button>
              <Button variant="outline" onClick={() => createNewParent(true)} disabled={savingGuardian}>
                {savingGuardian ? "Memproses..." : "Tetap Buat Baru"}
              </Button>
            </>
          );
          guardianBody = (
            <div className="space-y-field">
              <Alert ref={guardianBannerRef} tabIndex={-1}>
                <AlertTitle>Wali serupa sudah terdaftar</AlertTitle>
                <AlertDescription>
                  Tautkan data yang sudah ada agar satu keluarga tidak terpecah menjadi dua profil dan dua tagihan.
                </AlertDescription>
              </Alert>
              <div className="space-y-2">
                {candidates.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-3 rounded-md border p-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {[c.phone, c.email, `${c.childCount} anak terdaftar`].filter(Boolean).join(" · ")}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Cocok pada {MATCH_REASON_LABELS[c.matchReason] ?? c.matchReason}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      className="shrink-0"
                      onClick={() => linkExistingParent(c.id)}
                      disabled={savingGuardian}
                    >
                      Tautkan
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          );
        } else {
          guardianBody = <GuardianFormBody form={guardianForm} setForm={setGuardianForm} />;
          guardianFooter = (
            <>
              <Button
                variant="ghost"
                onClick={() => (addingGuardian ? setGuardianStep("link") : setGuardianDialog(false))}
                disabled={savingGuardian}
              >
                {addingGuardian ? "Kembali" : "Batal"}
              </Button>
              <Button
                onClick={() => (addingGuardian ? createNewParent(false) : saveGuardian())}
                disabled={savingGuardian}
              >
                {savingGuardian ? "Menyimpan..." : editingGuardian ? "Simpan Perubahan" : "Tambah Wali"}
              </Button>
            </>
          );
        }

        const guardianTitle = editingGuardian
          ? "Edit Wali"
          : guardianStep === "link"
            ? "Tautkan Wali"
            : guardianStep === "candidates"
              ? "Periksa Data Wali"
              : "Tambah Wali Baru";

        // side="right" on mobile: multi-section form (name/contact + pekerjaan subsection, 9 fields)
        // benefits from full-height surface; bottom sheet would only show ~30% before scroll.
        return isMobile ? (
          <Sheet open={guardianDialog} onOpenChange={setGuardianDialog}>
            <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
              <SheetHeader><SheetTitle>{guardianTitle}</SheetTitle></SheetHeader>
              <div className="px-4 pb-4">{guardianBody}</div>
              <SheetFooter>{guardianFooter}</SheetFooter>
            </SheetContent>
          </Sheet>
        ) : (
          <Dialog open={guardianDialog} onOpenChange={setGuardianDialog}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader><DialogTitle>{guardianTitle}</DialogTitle></DialogHeader>
              {/* flex-1 min-h-0 overflow-y-auto: T7+T8 grew the form
                  (childrenTotal + address + Data Anak section); body now
                  needs inner scroll to keep DialogFooter docked. */}
              <div className="flex-1 min-h-0 overflow-y-auto">{guardianBody}</div>
              <DialogFooter>{guardianFooter}</DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}

      <StudentEnrollDialog
        studentId={id}
        open={enrollDialog}
        onOpenChange={setEnrollDialog}
        onEnrolled={fetchStudent}
        isMobile={isMobile}
      />

      {/* ---------- Promote (2 fields) — side="bottom" on mobile ---------- */}
      {(() => {
        const promoteBody = (
          <div className="space-y-field">
            <Field>
              <FieldLabel required htmlFor="promote-class-section">Kelas Tujuan</FieldLabel>
              <ClassSectionCombobox
                id="promote-class-section"
                sections={sections}
                value={promoteTarget}
                onChange={setPromoteTarget}
                placeholder="Pilih kelas tujuan..."
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="promote-notes">Catatan (opsional)</FieldLabel>
              <Textarea id="promote-notes" value={promoteNotes} onChange={e => setPromoteNotes(e.target.value)} placeholder="Catatan naik kelas" rows={2} />
            </Field>
          </div>
        );
        return isMobile ? (
          <Sheet open={promoteDialog} onOpenChange={setPromoteDialog}>
            <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
              <SheetHeader><SheetTitle>Naik Kelas</SheetTitle></SheetHeader>
              <div className="px-4 pb-4">{promoteBody}</div>
              <SheetFooter>
                <Button variant="ghost" onClick={() => setPromoteDialog(false)} disabled={promoting}>Batal</Button>
                <Button onClick={handlePromote} disabled={promoting}>{promoting ? "Memproses..." : "Naik Kelas"}</Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        ) : (
          <Dialog open={promoteDialog} onOpenChange={setPromoteDialog}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader><DialogTitle>Naik Kelas</DialogTitle></DialogHeader>
              <div>{promoteBody}</div>
              <DialogFooter>
                <DialogClose><Button variant="ghost">Batal</Button></DialogClose>
                <Button onClick={handlePromote} disabled={promoting}>{promoting ? "Memproses..." : "Naik Kelas"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* Graduate Confirm */}
      <ConfirmDialog open={graduateOpen} onOpenChange={setGraduateOpen} title="Luluskan Siswa" description={`Luluskan ${student.name}? Status siswa akan berubah menjadi Lulus dan semua pendaftaran kelas aktif akan diakhiri.`} onConfirm={handleGraduate} confirmLabel={graduating ? "Memproses..." : "Luluskan"} />

      {/* ---------- Withdraw (destructive AlertDialog — reason required in body) ---------- */}
      <ConfirmDialog
        open={withdrawDialog}
        onOpenChange={setWithdrawDialog}
        title="Keluarkan Siswa"
        description={`Mengeluarkan ${student.name} dari sekolah. Status akan berubah menjadi Keluar dan semua pendaftaran kelas aktif akan diakhiri.`}
        confirmLabel={withdrawing ? "Memproses..." : "Keluarkan"}
        destructive
        loading={withdrawing}
        onConfirm={handleWithdraw}
      >
        <Field>
          <FieldLabel required htmlFor="withdraw-reason">Alasan Keluar</FieldLabel>
          <Textarea
            id="withdraw-reason"
            required
            aria-required="true"
            value={withdrawReason}
            onChange={(e) => setWithdrawReason(e.target.value)}
            placeholder="Masukkan alasan siswa keluar dari sekolah..."
            rows={3}
          />
        </Field>
      </ConfirmDialog>

      <ConfirmDialog
        open={!!deleteGuardianTarget}
        onOpenChange={(o) => !o && setDeleteGuardianTarget(null)}
        title={deleteGuardianTarget?.status === "INACTIVE" ? `Aktifkan wali ${deleteGuardianTarget?.parent?.name}?` : `Nonaktifkan wali ${deleteGuardianTarget?.parent?.name}?`}
        description={deleteGuardianTarget?.status === "INACTIVE" ? "Wali akan ditampilkan kembali di daftar wali aktif." : "Wali tidak akan ditampilkan. Data tetap tersimpan dan bisa diaktifkan kembali."}
        confirmLabel={deleteGuardianTarget?.status === "INACTIVE" ? "Aktifkan" : "Nonaktifkan"}
        destructive={deleteGuardianTarget?.status !== "INACTIVE"}
        onConfirm={deactivateGuardian}
      />
    </>
  );
}
