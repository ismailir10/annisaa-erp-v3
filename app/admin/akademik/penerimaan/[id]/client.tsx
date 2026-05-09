"use client";

// AdmissionDetailClient — state-aware admin detail surface for /admin/
// akademik/penerimaan/[id]. Renders header (title + status badge + sibling
// label badge + state-aware action button cluster) + 3 detail tabs
// (ringkasan / assessment / aktivitas) + dialogs (accept-confirm,
// interview-date, reject-reason, withdraw-reason).
//
// Bu Sari voice (admin tier) per .claude/standards/voice.md — collegial,
// action-oriented Ustadzah register. Layout per .claude/standards/patterns.md
// Recipe 2 — Admin Detail (PageHeader + breadcrumbs + Tabs + right-rail
// metadata aside; design-system tokens from design-system.html §1 + §6).
//
// All 6 transition wrappers from ./actions.ts return ActionResult<T>; this
// component dispatches via React useTransition + sonner toast surface for
// error / success feedback.
//
// Cycle: docs/cycles/2026-05-10-p2-admission-funnel-ui-review.md (T8)

import * as React from "react";
import { toast } from "sonner";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import {
  acceptAdmissionAction,
  offerAdmissionAction,
  rejectAdmissionAction,
  reviewAdmissionAction,
  scheduleInterviewAction,
  withdrawAdmissionAction,
} from "./actions";

type AdmissionStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "INTERVIEW_SCHEDULED"
  | "OFFER_EXTENDED"
  | "ACCEPTED"
  | "REJECTED"
  | "WITHDRAWN";

type AdmissionView = {
  id: string;
  status: AdmissionStatus;
  source: string;
  submittedAt: string | null;
  decidedAt: string | null;
  interviewScheduledFor: string | null;
  applicantFullName: string;
  applicantNickname: string | null;
  applicantBirthDate: string | null;
  applicantBirthPlace: string | null;
  applicantGender: string | null;
  fatherName: string | null;
  fatherOccupation: string | null;
  motherName: string | null;
  motherOccupation: string | null;
  notes: string | null;
  programLabel: string;
  academicYearLabel: string;
  siblingHouseholdLabel: string | null;
  acceptedStudentLabel: string | null;
};

type AssessmentRow = {
  id: string;
  assessmentDate: string;
  score: number | null;
  notes: string | null;
};

type TimelineRow = {
  id: string;
  kind: string;
  occurredAt: string;
  actorUserId: string | null;
  payload: Record<string, unknown>;
};

type Props = {
  admission: AdmissionView;
  assessments: ReadonlyArray<AssessmentRow>;
  timeline: ReadonlyArray<TimelineRow>;
  tenantDisplayName: string;
};

const STATUS_LABEL: Record<AdmissionStatus, string> = {
  DRAFT: "Draf",
  SUBMITTED: "Disubmit",
  UNDER_REVIEW: "Dalam Review",
  INTERVIEW_SCHEDULED: "Wawancara Terjadwal",
  OFFER_EXTENDED: "Tawaran Diberikan",
  ACCEPTED: "Diterima",
  REJECTED: "Ditolak",
  WITHDRAWN: "Ditarik",
};

const STATUS_VARIANT: Record<
  AdmissionStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  DRAFT: "outline",
  SUBMITTED: "secondary",
  UNDER_REVIEW: "secondary",
  INTERVIEW_SCHEDULED: "secondary",
  OFFER_EXTENDED: "default",
  ACCEPTED: "default",
  REJECTED: "destructive",
  WITHDRAWN: "outline",
};

const TERMINAL_STATES = new Set<AdmissionStatus>(["ACCEPTED", "REJECTED", "WITHDRAWN"]);

function guardianCount(admission: AdmissionView): number {
  let n = 0;
  if (admission.fatherName && admission.fatherName.length > 0) n++;
  if (admission.motherName && admission.motherName.length > 0) n++;
  return n;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateOnly(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
}

export function AdmissionDetailClient({
  admission,
  assessments,
  timeline,
  tenantDisplayName,
}: Props) {
  const [pending, startTransition] = React.useTransition();
  const [acceptOpen, setAcceptOpen] = React.useState(false);
  const [interviewOpen, setInterviewOpen] = React.useState(false);
  const [interviewDate, setInterviewDate] = React.useState("");
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [rejectReason, setRejectReason] = React.useState("");
  const [withdrawOpen, setWithdrawOpen] = React.useState(false);
  const [withdrawReason, setWithdrawReason] = React.useState("");

  const isTerminal = TERMINAL_STATES.has(admission.status);

  function handleResult(result: { ok: boolean; error?: string }, successMessage: string) {
    if (result.ok) {
      toast.success(successMessage);
    } else {
      toast.error(`Gagal: ${result.error ?? "tidak diketahui"}`);
    }
  }

  function dispatchReview() {
    startTransition(async () => {
      const r = await reviewAdmissionAction(admission.id);
      handleResult(r, "Pendaftaran dipindahkan ke review");
    });
  }

  function dispatchOffer() {
    startTransition(async () => {
      const r = await offerAdmissionAction(admission.id);
      handleResult(r, "Tawaran tempat dikirim");
    });
  }

  function dispatchInterview() {
    if (!interviewDate) {
      toast.error("Tanggal wawancara wajib diisi");
      return;
    }
    startTransition(async () => {
      const r = await scheduleInterviewAction(admission.id, interviewDate);
      handleResult(r, "Wawancara dijadwalkan");
      if (r.ok) {
        setInterviewOpen(false);
        setInterviewDate("");
      }
    });
  }

  function dispatchAccept() {
    // notificationEmail intentionally null this cycle — admin UI doesn't
    // collect a parent email at accept time. Future cycle adds the field
    // either denormalized on Admission or surfaced via Guardian roster.
    startTransition(async () => {
      const r = await acceptAdmissionAction(admission.id, null, tenantDisplayName);
      handleResult(r, "Pendaftaran diterima — keluarga & siswa & wali dibuat");
      if (r.ok) setAcceptOpen(false);
    });
  }

  function dispatchReject() {
    startTransition(async () => {
      const r = await rejectAdmissionAction(
        admission.id,
        rejectReason.trim() || null,
        null,
        tenantDisplayName,
      );
      handleResult(r, "Pendaftaran ditolak");
      if (r.ok) {
        setRejectOpen(false);
        setRejectReason("");
      }
    });
  }

  function dispatchWithdraw() {
    startTransition(async () => {
      const r = await withdrawAdmissionAction(admission.id, withdrawReason.trim() || null);
      handleResult(r, "Pendaftaran ditarik kembali");
      if (r.ok) {
        setWithdrawOpen(false);
        setWithdrawReason("");
      }
    });
  }

  return (
    <div data-slot="admission-detail" className="flex flex-col gap-section p-page-x py-page-y">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/admin">Admin</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/admin/akademik">Akademik</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/admin/akademik/penerimaan">
              Penerimaan
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{admission.applicantFullName}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              {admission.applicantFullName}
            </h1>
            <Badge variant={STATUS_VARIANT[admission.status]} data-slot="status-badge">
              {STATUS_LABEL[admission.status]}
            </Badge>
            {admission.siblingHouseholdLabel && (
              <Badge variant="outline" data-slot="sibling-badge">
                Keluarga terdeteksi: {admission.siblingHouseholdLabel}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {admission.programLabel} · TA {admission.academicYearLabel}
            {admission.submittedAt
              ? ` · Disubmit ${formatDate(admission.submittedAt)}`
              : ""}
          </p>
          {admission.acceptedStudentLabel && (
            <p className="text-sm text-muted-foreground">
              Siswa terbentuk: {admission.acceptedStudentLabel}
            </p>
          )}
        </div>

        {!isTerminal && (
          <ActionCluster
            status={admission.status}
            pending={pending}
            onReview={dispatchReview}
            onScheduleInterview={() => setInterviewOpen(true)}
            onOffer={dispatchOffer}
            onAccept={() => setAcceptOpen(true)}
            onReject={() => setRejectOpen(true)}
            onWithdraw={() => setWithdrawOpen(true)}
          />
        )}
      </header>

      <Tabs defaultValue="ringkasan">
        <TabsList>
          <TabsTrigger value="ringkasan">Ringkasan</TabsTrigger>
          <TabsTrigger value="assessment">Asesmen Awal</TabsTrigger>
          <TabsTrigger value="aktivitas">Aktivitas</TabsTrigger>
        </TabsList>

        <TabsContent value="ringkasan" className="mt-section">
          <RingkasanTab admission={admission} />
        </TabsContent>

        <TabsContent value="assessment" className="mt-section">
          <AssessmentTab assessments={assessments} />
        </TabsContent>

        <TabsContent value="aktivitas" className="mt-section">
          <AktivitasTab events={timeline} />
        </TabsContent>
      </Tabs>

      {/* INTERVIEW_SCHEDULED date dialog (Spec assumption 3 — Input type=date) */}
      <Dialog open={interviewOpen} onOpenChange={setInterviewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Jadwalkan wawancara</DialogTitle>
            <DialogDescription>
              Pilih tanggal wawancara dengan keluarga {admission.applicantFullName}.
              Status pendaftaran akan dipindahkan ke &quot;Wawancara Terjadwal&quot;.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="interviewDate">Tanggal wawancara</Label>
            <Input
              id="interviewDate"
              type="date"
              value={interviewDate}
              onChange={(e) => setInterviewDate(e.target.value)}
              disabled={pending}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setInterviewOpen(false)}
              disabled={pending}
            >
              Batal
            </Button>
            <Button onClick={dispatchInterview} disabled={pending || !interviewDate}>
              {pending ? "Menyimpan..." : "Jadwalkan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ACCEPTED confirmation dialog (Spec AC3) */}
      <Dialog open={acceptOpen} onOpenChange={setAcceptOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Terima pendaftaran?</DialogTitle>
            <DialogDescription>
              {`Akan membuat ${admission.siblingHouseholdLabel ? "0" : "1"} Keluarga + 1 Siswa + ${guardianCount(admission)} Wali baru. Lanjutkan?`}
              {admission.siblingHouseholdLabel && (
                <>
                  {" "}
                  Karena keluarga sudah terdeteksi (
                  <strong>{admission.siblingHouseholdLabel}</strong>), siswa
                  ditambahkan ke keluarga tersebut, bukan keluarga baru.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAcceptOpen(false)} disabled={pending}>
              Batal
            </Button>
            <Button onClick={dispatchAccept} disabled={pending}>
              {pending ? "Memproses..." : "Lanjutkan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* REJECT reason dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tolak pendaftaran</DialogTitle>
            <DialogDescription>
              Catatan internal opsional. Email penolakan akan dikirim ke wali bila
              email notifikasi tersedia (template netral, tanpa alasan spesifik).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rejectReason">Catatan (opsional)</Label>
            <Textarea
              id="rejectReason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              maxLength={1000}
              rows={4}
              disabled={pending}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={pending}>
              Batal
            </Button>
            <Button variant="destructive" onClick={dispatchReject} disabled={pending}>
              {pending ? "Memproses..." : "Tolak"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* WITHDRAW reason dialog */}
      <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tarik kembali pendaftaran</DialogTitle>
            <DialogDescription>
              Catatan internal opsional. Tindakan ini menutup pendaftaran tanpa
              keputusan terima/tolak.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="withdrawReason">Catatan (opsional)</Label>
            <Textarea
              id="withdrawReason"
              value={withdrawReason}
              onChange={(e) => setWithdrawReason(e.target.value)}
              maxLength={1000}
              rows={4}
              disabled={pending}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWithdrawOpen(false)} disabled={pending}>
              Batal
            </Button>
            <Button variant="outline" onClick={dispatchWithdraw} disabled={pending}>
              {pending ? "Memproses..." : "Tarik kembali"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Action button cluster (state-aware) ─────────────────────────────────────

function ActionCluster(props: {
  status: AdmissionStatus;
  pending: boolean;
  onReview: () => void;
  onScheduleInterview: () => void;
  onOffer: () => void;
  onAccept: () => void;
  onReject: () => void;
  onWithdraw: () => void;
}) {
  const { status, pending } = props;
  return (
    <div className="flex flex-wrap gap-2" data-slot="action-cluster">
      {status === "SUBMITTED" && (
        <>
          <Button onClick={props.onReview} disabled={pending}>
            Pindahkan ke review
          </Button>
          <Button variant="outline" onClick={props.onReject} disabled={pending}>
            Tolak
          </Button>
          <Button variant="outline" onClick={props.onWithdraw} disabled={pending}>
            Tarik kembali
          </Button>
        </>
      )}
      {status === "UNDER_REVIEW" && (
        <>
          <Button onClick={props.onScheduleInterview} disabled={pending}>
            Jadwalkan wawancara
          </Button>
          <Button variant="secondary" onClick={props.onOffer} disabled={pending}>
            Tawarkan tempat
          </Button>
          <Button variant="outline" onClick={props.onReject} disabled={pending}>
            Tolak
          </Button>
          <Button variant="outline" onClick={props.onWithdraw} disabled={pending}>
            Tarik kembali
          </Button>
        </>
      )}
      {status === "INTERVIEW_SCHEDULED" && (
        <>
          <Button onClick={props.onOffer} disabled={pending}>
            Tawarkan tempat
          </Button>
          <Button variant="outline" onClick={props.onReject} disabled={pending}>
            Tolak
          </Button>
          <Button variant="outline" onClick={props.onWithdraw} disabled={pending}>
            Tarik kembali
          </Button>
        </>
      )}
      {status === "OFFER_EXTENDED" && (
        <>
          <Button onClick={props.onAccept} disabled={pending}>
            Tandai diterima
          </Button>
          <Button variant="outline" onClick={props.onReject} disabled={pending}>
            Tolak
          </Button>
          <Button variant="outline" onClick={props.onWithdraw} disabled={pending}>
            Tarik kembali
          </Button>
        </>
      )}
      {status === "DRAFT" && (
        <Button variant="outline" onClick={props.onWithdraw} disabled={pending}>
          Tarik kembali
        </Button>
      )}
    </div>
  );
}

// ── Tab content (co-located per spec T9 — registry detailTabs left as deferred placeholders) ──

function RingkasanTab({ admission }: { admission: AdmissionView }) {
  return (
    <div className="grid gap-section md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Calon Siswa</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Field label="Nama lengkap" value={admission.applicantFullName} />
          <Field label="Panggilan" value={admission.applicantNickname ?? "—"} />
          <Field label="Tanggal lahir" value={formatDateOnly(admission.applicantBirthDate)} />
          <Field label="Tempat lahir" value={admission.applicantBirthPlace ?? "—"} />
          <Field label="Jenis kelamin" value={admission.applicantGender ?? "—"} />
          <Field label="Program" value={admission.programLabel} />
          <Field label="Tahun ajaran" value={admission.academicYearLabel} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Orang Tua</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Field label="Ayah" value={admission.fatherName ?? "—"} />
          <Field label="Pekerjaan ayah" value={admission.fatherOccupation ?? "—"} />
          <Field label="Ibu" value={admission.motherName ?? "—"} />
          <Field label="Pekerjaan ibu" value={admission.motherOccupation ?? "—"} />
          <p className="text-xs text-muted-foreground pt-2">
            NIK + nomor telepon orang tua tidak ditampilkan di sini per kebijakan
            PII; data tersedia setelah pendaftaran diterima dan keluarga + wali
            terbentuk di tab Wali keluarga.
          </p>
        </CardContent>
      </Card>

      {admission.notes && (
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Catatan internal</CardTitle>
          </CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">
            {admission.notes}
          </CardContent>
        </Card>
      )}

      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Field label="Status saat ini" value={STATUS_LABEL[admission.status]} />
          <Field label="Sumber" value={admission.source} />
          <Field label="Disubmit" value={formatDate(admission.submittedAt)} />
          {admission.interviewScheduledFor && (
            <Field
              label="Wawancara dijadwalkan"
              value={formatDateOnly(admission.interviewScheduledFor)}
            />
          )}
          {admission.decidedAt && (
            <Field label="Diputuskan" value={formatDate(admission.decidedAt)} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AssessmentTab({ assessments }: { assessments: ReadonlyArray<AssessmentRow> }) {
  if (assessments.length === 0) {
    return (
      <Card>
        <CardContent className="text-sm text-muted-foreground py-section">
          Belum ada asesmen awal. Editor asesmen akan tersedia di siklus
          berikutnya — saat ini tab hanya menampilkan baris yang sudah ada.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="divide-y text-sm">
        {assessments.map((a) => (
          <div key={a.id} className="py-3 flex items-start justify-between gap-4">
            <div>
              <p className="font-medium">{formatDateOnly(a.assessmentDate)}</p>
              {a.notes && <p className="text-muted-foreground">{a.notes}</p>}
            </div>
            <span className="text-sm font-mono">{a.score ?? "—"}/100</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function AktivitasTab({ events }: { events: ReadonlyArray<TimelineRow> }) {
  if (events.length === 0) {
    return (
      <Card>
        <CardContent className="text-sm text-muted-foreground py-section">
          Belum ada aktivitas tercatat untuk pendaftaran ini.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="divide-y text-sm">
        {events.map((e) => {
          const payload = e.payload as { from?: string; to?: string; reason?: string };
          return (
            <div key={e.id} className="py-3">
              <p className="font-medium">
                {e.kind === "admission.status-changed" && payload.from && payload.to
                  ? `${STATUS_LABEL[payload.from as AdmissionStatus] ?? payload.from} → ${STATUS_LABEL[payload.to as AdmissionStatus] ?? payload.to}`
                  : e.kind}
              </p>
              <p className="text-muted-foreground text-xs">{formatDate(e.occurredAt)}</p>
              {payload.reason && (
                <p className="text-muted-foreground italic mt-1">&ldquo;{payload.reason}&rdquo;</p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="col-span-2">{value}</span>
    </div>
  );
}
