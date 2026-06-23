"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { StatusChip } from "../page";
import {
  AGAMA_OPTIONS, KEWARGANEGARAAN_OPTIONS, LIVING_WITH_OPTIONS, BIRTH_DELIVERY_OPTIONS,
  BIRTH_TERM_OPTIONS, BLOOD_TYPE_OPTIONS, EDUCATION_OPTIONS, OCCUPATION_OPTIONS, INCOME_OPTIONS,
  type Option,
} from "@/lib/enrollment/constants";

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

function labelOf(options: Option[], value: unknown): string {
  if (typeof value !== "string" || !value) return "—";
  return options.find((o) => o.value === value)?.label ?? value;
}
function v(x: unknown): string {
  return typeof x === "string" && x ? x : typeof x === "number" ? String(x) : "—";
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/50 py-1.5 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-4">
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ParentSection({ title, p }: { title: string; p: any }) {
  const d = p ?? {};
  const a = d.address ?? {};
  return (
    <Section title={title}>
      <Row label="Nama" value={v(d.name)} />
      <Row label="Tempat, tanggal lahir" value={[v(d.birthPlace), v(d.dateOfBirth)].filter((s) => s !== "—").join(", ") || "—"} />
      <Row label="Agama" value={labelOf(AGAMA_OPTIONS, d.agama)} />
      <Row label="No. HP" value={v(d.phone)} />
      <Row label="Email" value={v(d.email)} />
      <Row label="Pendidikan" value={labelOf(EDUCATION_OPTIONS, d.education)} />
      <Row label="Pekerjaan" value={labelOf(OCCUPATION_OPTIONS, d.occupation)} />
      <Row label="Penghasilan" value={labelOf(INCOME_OPTIONS, d.income)} />
      <Row label="Nama kantor" value={v(d.employerName)} />
      <Row label="Alamat" value={[v(a.perumahan), v(a.kecamatan)].filter((s) => s !== "—").join(", ") || "—"} />
    </Section>
  );
}

export default function EnrollmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [d, setD] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

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

  if (loading) return <p className="p-6 text-sm text-muted-foreground">Memuat…</p>;
  if (!d) return <p className="p-6 text-sm text-muted-foreground">Formulir tidak ditemukan.</p>;

  const s = d.studentData ?? {};
  const addr = s.address ?? {};
  const consent = d.consentData ?? {};
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
      <Button variant="ghost" size="sm" render={<Link href="/admin/enrollments" />}>
        <ArrowLeft size={14} /> Kembali ke daftar
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{d.childName || "Tanpa nama"}</h1>
          <div className="mt-1 flex items-center gap-2">
            <StatusChip status={d.status} studentId={d.studentId} />
            <span className="text-sm text-muted-foreground">
              {d.program?.name ?? "—"}
              {d.dcareAddon ? " + Dcare" : ""}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {actions.map((a) => (
            <Button key={a.to} size="sm" variant={a.variant} disabled={busy} onClick={() => transition(a.to)}>
              {a.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Data Anak">
          <Row label="Nama lengkap" value={v(s.childName)} />
          <Row label="Nama panggilan" value={v(s.nickname)} />
          <Row label="Jenis kelamin" value={s.childGender === "L" ? "Laki-laki" : s.childGender === "P" ? "Perempuan" : "—"} />
          <Row label="Tempat, tanggal lahir" value={[v(s.birthPlace), v(s.dateOfBirth)].filter((x) => x !== "—").join(", ") || "—"} />
          <Row label="Agama" value={labelOf(AGAMA_OPTIONS, s.agama)} />
          <Row label="Kewarganegaraan" value={labelOf(KEWARGANEGARAAN_OPTIONS, s.kewarganegaraan)} />
          <Row label="Tinggal bersama" value={labelOf(LIVING_WITH_OPTIONS, s.livingWith)} />
          <Row label="Bahasa di rumah" value={v(s.homeLanguage)} />
          <Row label="Alamat" value={[v(addr.perumahan), v(addr.blokCluster), v(addr.kecamatan), v(addr.kodePos)].filter((x) => x !== "—").join(", ") || "—"} />
        </Section>

        <Section title="Kelahiran & Kesehatan">
          <Row label="Jalan lahir" value={labelOf(BIRTH_DELIVERY_OPTIONS, s.birthDelivery)} />
          <Row label="Bulan lahir" value={labelOf(BIRTH_TERM_OPTIONS, s.birthTerm)} />
          <Row label="Berat badan" value={s.weightKg ? `${v(s.weightKg)} kg` : "—"} />
          <Row label="Tinggi badan" value={s.heightCm ? `${v(s.heightCm)} cm` : "—"} />
          <Row label="Lingkar kepala" value={s.headCircumferenceCm ? `${v(s.headCircumferenceCm)} cm` : "—"} />
          <Row label="Golongan darah" value={labelOf(BLOOD_TYPE_OPTIONS, s.bloodType)} />
          <Row label="Alergi makanan" value={v(s.foodAllergy)} />
          <Row label="Penyakit berat" value={v(s.seriousIllness)} />
          <Row label="Anak ke-" value={v(s.childOrder)} />
        </Section>

        <ParentSection title="Data Ayah" p={d.ayahData} />
        <ParentSection title="Data Ibu" p={d.ibuData} />

        <Section title="Surat Persetujuan">
          <Row label="Disetujui" value={consent.agreed ? "Ya" : "Belum"} />
          <Row label="Versi" value={v(consent.version)} />
          <Row label="Ditandatangani Ayah" value={v(consent.ayah?.name)} />
          <Row label="Ditandatangani Ibu" value={v(consent.ibu?.name)} />
          <div className="mt-3 grid grid-cols-2 gap-3">
            {(["ayah", "ibu"] as const).map((which) =>
              consent[which]?.signatureToken ? (
                <figure key={which} className="rounded-lg border p-2">
                  <figcaption className="mb-1 text-xs text-muted-foreground capitalize">{which}</figcaption>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/enrollments/${id}/signature?which=${which}`}
                    alt={`Tanda tangan ${which}`}
                    className="h-24 w-full rounded bg-white object-contain"
                  />
                </figure>
              ) : null,
            )}
          </div>
        </Section>
      </div>

      {d.status === "ACCEPTED" && !d.studentId && (
        <>
          <Separator />
          <p className="text-sm text-muted-foreground">
            Formulir sudah diterima. Konversi ke data siswa tersedia pada langkah berikutnya.
          </p>
        </>
      )}
    </div>
  );
}
