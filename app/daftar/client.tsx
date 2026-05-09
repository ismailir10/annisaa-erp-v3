"use client";

// Multi-step admission form client. Five steps:
//   1. Anak (applicant identity)
//   2. Orang Tua (parent snapshots)
//   3. Alamat (AddressChainField — saves to /api/public/address)
//   4. Program (programId + academicYearId + notification email)
//   5. Tinjau (review + submit → /api/admission/submit)
//
// Voice: Bu Nur tier (warmest of three) per .claude/standards/voice.md.
// Cross-checked design-system.html §6 (form shells) + §1 (typography
// + spacing tokens). Each step uses the same `<Card>` shell + sticky
// "Lanjut" / "Kembali" navigation pair.
//
// Cycle: docs/cycles/2026-05-10-p2-admission-funnel-ui-public.md (T9)

import { useCallback, useMemo, useState } from "react";

import { AddressChainField } from "@/components/forms/address-chain-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type Program = { id: string; name: string };
type AcademicYear = { id: string; name: string; isCurrent: boolean };

interface Props {
  tenantSlug: string;
  tenantName: string;
  programs: Program[];
  academicYears: AcademicYear[];
}

type Step = 1 | 2 | 3 | 4 | 5;

const STEP_LABELS: Record<Step, string> = {
  1: "Anak",
  2: "Orang Tua",
  3: "Alamat",
  4: "Program",
  5: "Tinjau & Kirim",
};

type SubmitResult =
  | { ok: true; trackingCode: string; admissionId: string }
  | { ok: false; error: string; field?: string };

export function DaftarClient({ tenantSlug, tenantName, programs, academicYears }: Props) {
  const [step, setStep] = useState<Step>(1);

  // ── Step 1 — Anak ──────────────────────────────────────────
  const [applicantFullName, setApplicantFullName] = useState("");
  const [applicantNickname, setApplicantNickname] = useState("");
  const [applicantBirthPlace, setApplicantBirthPlace] = useState("");
  const [applicantBirthDate, setApplicantBirthDate] = useState("");
  const [applicantGender, setApplicantGender] = useState<"MALE" | "FEMALE" | "">("");

  // ── Step 2 — Orang Tua ─────────────────────────────────────
  const [fatherName, setFatherName] = useState("");
  const [fatherPhone, setFatherPhone] = useState("");
  const [motherName, setMotherName] = useState("");
  const [motherPhone, setMotherPhone] = useState("");

  // ── Step 3 — Alamat ────────────────────────────────────────
  const [addressId, setAddressId] = useState<string | null>(null);

  // ── Step 4 — Program ───────────────────────────────────────
  const defaultAcademicYearId =
    academicYears.find((y) => y.isCurrent)?.id ?? academicYears[0]?.id ?? "";
  const [programId, setProgramId] = useState(programs[0]?.id ?? "");
  const [academicYearId, setAcademicYearId] = useState(defaultAcademicYearId);
  const [notificationEmail, setNotificationEmail] = useState("");
  const [notes, setNotes] = useState("");

  // ── Status ─────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);

  const handleAddressSave = useCallback(
    async (
      values: Record<string, unknown>,
    ): Promise<
      | { ok: true; addressId: string }
      | { ok: false; error: string; field?: string }
    > => {
      const res = await fetch("/api/public/address", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantSlug, ...values }),
      });
      const json = (await res.json()) as
        | { ok: true; addressId: string }
        | { error: string; message: string; field?: string };
      if (!res.ok || !("ok" in json) || !json.ok) {
        const err = json as { error: string; message: string; field?: string };
        return { ok: false, error: err.message ?? err.error, field: err.field };
      }
      setAddressId(json.addressId);
      return { ok: true, addressId: json.addressId };
    },
    [tenantSlug],
  );

  const canAdvance: Record<Step, boolean> = useMemo(
    () => ({
      1: applicantFullName.trim().length > 0,
      2:
        (fatherName.trim().length > 0 || motherName.trim().length > 0) &&
        (fatherPhone.trim().length > 0 || motherPhone.trim().length > 0),
      3: addressId !== null,
      4:
        programId.length > 0 &&
        academicYearId.length > 0 &&
        notificationEmail.trim().length > 0,
      5: true,
    }),
    [
      applicantFullName,
      fatherName,
      motherName,
      fatherPhone,
      motherPhone,
      addressId,
      programId,
      academicYearId,
      notificationEmail,
    ],
  );

  const submit = useCallback(async () => {
    setSubmitting(true);
    setResult(null);
    try {
      const payload = {
        tenantSlug,
        notificationEmail,
        programId,
        academicYearId,
        addressId,
        applicantFullName,
        applicantNickname: applicantNickname || undefined,
        applicantBirthPlace: applicantBirthPlace || undefined,
        applicantBirthDate: applicantBirthDate || undefined,
        applicantGender: applicantGender || undefined,
        fatherName: fatherName || undefined,
        fatherPhone: fatherPhone || undefined,
        motherName: motherName || undefined,
        motherPhone: motherPhone || undefined,
        notes: notes || undefined,
      };
      const res = await fetch("/api/admission/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as
        | { ok: true; trackingCode: string; admissionId: string }
        | { error: string; message: string; field?: string };
      if (!res.ok || !("ok" in json) || !json.ok) {
        const err = json as { error: string; message: string; field?: string };
        setResult({ ok: false, error: err.message ?? err.error, field: err.field });
        return;
      }
      setResult({
        ok: true,
        trackingCode: json.trackingCode,
        admissionId: json.admissionId,
      });
    } catch (err) {
      setResult({
        ok: false,
        error: "Koneksi terputus. Mohon coba lagi sebentar ya.",
      });
      console.error("admission submit failed", err);
    } finally {
      setSubmitting(false);
    }
  }, [
    tenantSlug,
    notificationEmail,
    programId,
    academicYearId,
    addressId,
    applicantFullName,
    applicantNickname,
    applicantBirthPlace,
    applicantBirthDate,
    applicantGender,
    fatherName,
    fatherPhone,
    motherName,
    motherPhone,
    notes,
  ]);

  if (result?.ok) {
    return (
      <Card data-testid="daftar-confirmation">
        <CardHeader>
          <CardTitle>Alhamdulillah, pendaftaran terkirim</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">
            Terima kasih telah mendaftarkan {applicantFullName} di {tenantName}.
            Kami sudah mengirim email konfirmasi ke{" "}
            <span className="font-medium">{notificationEmail}</span>.
          </p>
          <div className="rounded-md border bg-muted/40 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Kode pelacakan
            </p>
            <p
              className="mt-1 font-mono text-lg font-semibold"
              data-testid="daftar-tracking-code"
            >
              {result.trackingCode}
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            Mohon simpan kode ini. InsyaAllah tim penerimaan akan menghubungi
            Ibu/Bapak melalui email atau telepon dalam waktu dekat.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <ol className="flex flex-wrap gap-2 text-xs">
        {(Object.keys(STEP_LABELS) as unknown as Step[]).map((s) => {
          const n = Number(s) as Step;
          return (
            <li
              key={n}
              className={
                n === step
                  ? "rounded-full bg-primary px-3 py-1 font-medium text-primary-foreground"
                  : n < step
                    ? "rounded-full border bg-muted px-3 py-1 text-muted-foreground"
                    : "rounded-full border px-3 py-1 text-muted-foreground/70"
              }
            >
              {n}. {STEP_LABELS[n]}
            </li>
          );
        })}
      </ol>

      <Card>
        <CardHeader>
          <CardTitle>{STEP_LABELS[step]}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {step === 1 && (
            <>
              <Field label="Nama Lengkap Anak" required>
                <Input
                  value={applicantFullName}
                  onChange={(e) => setApplicantFullName(e.target.value)}
                  placeholder="Aisyah Nur Hasan"
                  data-testid="daftar-applicant-name"
                />
              </Field>
              <Field label="Nama Panggilan">
                <Input
                  value={applicantNickname}
                  onChange={(e) => setApplicantNickname(e.target.value)}
                  placeholder="Aisyah"
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Tempat Lahir">
                  <Input
                    value={applicantBirthPlace}
                    onChange={(e) => setApplicantBirthPlace(e.target.value)}
                    placeholder="Jakarta"
                  />
                </Field>
                <Field label="Tanggal Lahir">
                  <Input
                    type="date"
                    value={applicantBirthDate}
                    onChange={(e) => setApplicantBirthDate(e.target.value)}
                  />
                </Field>
              </div>
              <Field label="Jenis Kelamin">
                <Select
                  value={applicantGender}
                  onValueChange={(v) =>
                    setApplicantGender((v as "MALE" | "FEMALE" | null) ?? "")
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih jenis kelamin" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MALE">Laki-laki</SelectItem>
                    <SelectItem value="FEMALE">Perempuan</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </>
          )}

          {step === 2 && (
            <>
              <p className="text-sm text-muted-foreground">
                Mohon isi minimal salah satu kontak orang tua agar tim kami
                dapat menghubungi Ibu/Bapak.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nama Ayah">
                  <Input
                    value={fatherName}
                    onChange={(e) => setFatherName(e.target.value)}
                  />
                </Field>
                <Field label="Nomor HP Ayah">
                  <Input
                    value={fatherPhone}
                    onChange={(e) => setFatherPhone(e.target.value)}
                    placeholder="0812..."
                    data-testid="daftar-father-phone"
                  />
                </Field>
                <Field label="Nama Ibu">
                  <Input
                    value={motherName}
                    onChange={(e) => setMotherName(e.target.value)}
                  />
                </Field>
                <Field label="Nomor HP Ibu">
                  <Input
                    value={motherPhone}
                    onChange={(e) => setMotherPhone(e.target.value)}
                    placeholder="0812..."
                  />
                </Field>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <p className="text-sm text-muted-foreground">
                Pilih provinsi → kabupaten/kota → kecamatan → kelurahan, lalu
                lengkapi alamat lengkap. Klik <span className="font-medium">Simpan Alamat</span>{" "}
                untuk menyimpan ke server sebelum melanjutkan.
              </p>
              {addressId ? (
                <Alert>
                  <AlertTitle>Alamat tersimpan</AlertTitle>
                  <AlertDescription>
                    ID alamat: <code className="font-mono">{addressId}</code>
                    <br />
                    Klik <span className="font-medium">Lanjut</span> untuk
                    melanjutkan ke pemilihan program.
                  </AlertDescription>
                </Alert>
              ) : null}
              <AddressChainField onSave={handleAddressSave} />
            </>
          )}

          {step === 4 && (
            <>
              <Field label="Program" required>
                <Select value={programId} onValueChange={(v) => setProgramId(v ?? "")}>
                  <SelectTrigger data-testid="daftar-program">
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
              <Field label="Tahun Ajaran" required>
                <Select
                  value={academicYearId}
                  onValueChange={(v) => setAcademicYearId(v ?? "")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih tahun ajaran" />
                  </SelectTrigger>
                  <SelectContent>
                    {academicYears.map((y) => (
                      <SelectItem key={y.id} value={y.id}>
                        {y.name}
                        {y.isCurrent ? " (berjalan)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Email untuk Notifikasi" required>
                <Input
                  type="email"
                  value={notificationEmail}
                  onChange={(e) => setNotificationEmail(e.target.value)}
                  placeholder="ibu.nur@example.com"
                  data-testid="daftar-notification-email"
                />
              </Field>
              <Field label="Catatan Tambahan">
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Misalnya: anak memiliki alergi tertentu."
                />
              </Field>
            </>
          )}

          {step === 5 && (
            <>
              <p className="text-sm text-muted-foreground">
                Mohon tinjau ringkasan berikut sebelum mengirim.
              </p>
              <dl className="space-y-2 text-sm">
                <SummaryRow label="Nama Anak" value={applicantFullName} />
                <SummaryRow
                  label="Program"
                  value={programs.find((p) => p.id === programId)?.name ?? ""}
                />
                <SummaryRow
                  label="Tahun Ajaran"
                  value={academicYears.find((y) => y.id === academicYearId)?.name ?? ""}
                />
                <SummaryRow label="Email Notifikasi" value={notificationEmail} />
                <SummaryRow label="ID Alamat" value={addressId ?? "—"} />
              </dl>

              {result?.ok === false ? (
                <Alert variant="destructive">
                  <AlertTitle>Gagal mengirim</AlertTitle>
                  <AlertDescription>{result.error}</AlertDescription>
                </Alert>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setStep((s) => (s > 1 ? ((s - 1) as Step) : s))}
          disabled={step === 1 || submitting}
        >
          Kembali
        </Button>

        {step < 5 ? (
          <Button
            type="button"
            onClick={() => setStep((s) => ((s + 1) as Step))}
            disabled={!canAdvance[step] || submitting}
            data-testid="daftar-next"
          >
            Lanjut
          </Button>
        ) : (
          <Button
            type="button"
            onClick={submit}
            disabled={submitting || !canAdvance[4]}
            data-testid="daftar-submit"
          >
            {submitting ? "Mengirim…" : "Kirim Pendaftaran"}
          </Button>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </Label>
      {children}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b pb-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
