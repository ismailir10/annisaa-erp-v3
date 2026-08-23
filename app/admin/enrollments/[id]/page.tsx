"use client";

import { use, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DetailPageHeader } from "@/components/admin/detail-page-header";
import { DetailPageSkeleton } from "@/components/admin/detail-page-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusChip } from "../status-chip";
import { EnrollmentApplicationView } from "@/components/admin/enrollment-application-view";

type Detail = {
  id: string;
  status: string;
  studentId: string | null;
  childName: string;
  parentEmail: string | null;
  dcareAddon: boolean;
  submittedAt: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  studentData: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ayahData: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ibuData: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  consentData: any;
  program: { id: string; name: string } | null;
  admission: { id: string; parentName: string; parentPhone: string | null } | null;
};

export default function EnrollmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [d, setD] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/enrollments/${id}`);
      if (res.ok) setD(await res.json());
      else setD(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function convert() {
    setBusy(true);
    let errorToasted = false;
    try {
      const res = await fetch(`/api/enrollments/${id}/convert`, { method: "POST" });
      if (res.ok) {
        toast.success("Siswa berhasil dibuat dari formulir");
        void load();
        return;
      }

      const jr = (await res.json()) as { error?: string };
      errorToasted = true;
      toast.error(jr.error || "Gagal konversi");
      throw new Error("Enrollment conversion failed");
    } catch (error) {
      if (!errorToasted) {
        toast.error("Gagal mengonversi formulir. Coba lagi.");
      }
      throw error instanceof Error
        ? error
        : new Error("Enrollment conversion failed");
    } finally {
      setBusy(false);
    }
  }

  async function transition(status: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/enrollments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        toast.success("Status diperbarui");
        void load();
      } else {
        const j = await res.json().catch(() => ({}));
        toast.error(j.error || "Gagal memperbarui status");
      }
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <DetailPageSkeleton />;
  if (!d)
    return (
      <EmptyState
        title="Formulir tidak ditemukan"
        description="Formulir pendaftaran ini tidak tersedia atau telah dihapus."
        actionLabel="Kembali ke Daftar Formulir Pendaftaran"
        actionHref="/admin/enrollments"
      />
    );

  const transitions: Record<string, { label: string; to: string; variant?: "outline" }[]> = {
    SUBMITTED: [
      { label: "Mulai Tinjau", to: "UNDER_REVIEW", variant: "outline" },
      { label: "Terima", to: "ACCEPTED" },
      { label: "Tolak", to: "REJECTED", variant: "outline" },
    ],
    UNDER_REVIEW: [
      { label: "Terima", to: "ACCEPTED" },
      { label: "Tolak", to: "REJECTED", variant: "outline" },
    ],
    ACCEPTED: [{ label: "Kembali ke Tinjau", to: "UNDER_REVIEW", variant: "outline" }],
    REJECTED: [{ label: "Tinjau Ulang", to: "UNDER_REVIEW", variant: "outline" }],
  };
  const actions = d.studentId ? [] : (transitions[d.status] ?? []);

  return (
    <div className="space-y-4">
      <DetailPageHeader
        backHref="/admin/enrollments"
        backLabel="Kembali ke Daftar Formulir Pendaftaran"
        title={d.childName || "Tanpa nama"}
        description={`${d.program?.name ?? "—"}${d.dcareAddon ? " + Dcare" : ""}`}
        badge={<StatusChip status={d.status} studentId={d.studentId} />}
        actions={
          actions.length > 0 ? (
            <>
              {actions.map((a) => (
                <Button key={a.to} size="sm" variant={a.variant} disabled={busy} onClick={() => transition(a.to)}>
                  {a.label}
                </Button>
              ))}
            </>
          ) : undefined
        }
      />

      <EnrollmentApplicationView
        application={{
          id,
          studentData: d.studentData,
          ayahData: d.ayahData,
          ibuData: d.ibuData,
          consentData: d.consentData,
        }}
      />

      {d.status === "ACCEPTED" && !d.studentId && (
        <>
          <Separator />
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
            <p className="text-sm text-muted-foreground">
              Formulir sudah diterima. Konversi menjadi data siswa + orang tua.
            </p>
            <Button onClick={() => setConvertOpen(true)} disabled={busy}>
              Konversi ke Siswa
            </Button>
          </div>
        </>
      )}
      {d.studentId && (
        <>
          <Separator />
          <p className="text-sm text-status-present-text">
            Formulir ini sudah dikonversi menjadi data siswa.
          </p>
        </>
      )}
      <ConfirmDialog
        open={convertOpen}
        onOpenChange={setConvertOpen}
        title="Konversi menjadi siswa?"
        description="Tindakan ini membuat data siswa dan data orang tua dari formulir pendaftaran ini."
        confirmLabel="Konversi ke Siswa"
        loading={busy}
        onConfirm={convert}
      />
    </div>
  );
}
