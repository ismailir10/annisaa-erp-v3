"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/admin/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { formatLearningCenter } from "@/lib/format";
import { ClipboardList, CalendarDays, Building2, AlertCircle } from "lucide-react";

type WalasRow = {
  classSectionId: string;
  className: string;
  programName: string;
  enrolled: number;
  assessed: number;
};
type SentraRow = { center: string; entries: number; studentsAssessed: number };
type Monitor = {
  academicYear: string;
  weekDate: string;
  sentraDate: string;
  week: { id: string; number: number; subThemeName: string; themeName: string } | null;
  walas: WalasRow[];
  sentra: SentraRow[];
};

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function CompletionBadge({ assessed, enrolled }: { assessed: number; enrolled: number }) {
  if (enrolled === 0) {
    return <Badge variant="outline" className="text-muted-foreground">— belum ada siswa</Badge>;
  }
  const done = assessed >= enrolled;
  const started = assessed > 0;
  const cls = done
    ? "bg-status-present/10 text-status-present border-status-present/20"
    : started
      ? "bg-primary/10 text-primary border-primary/20"
      : "text-muted-foreground";
  return (
    <Badge variant="outline" className={cls}>
      {assessed}/{enrolled} dinilai
    </Badge>
  );
}

export default function AdminPenilaianPage() {
  const [weekDate, setWeekDate] = useState(todayYmd);
  const [sentraDay, setSentraDay] = useState(todayYmd);
  const [data, setData] = useState<Monitor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ week: weekDate, day: sentraDay });
      const res = await fetch(`/api/admin/penilaian?${params}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Gagal memuat data penilaian.");
        setData(null);
        return;
      }
      const json = (await res.json()) as { data: Monitor };
      setData(json.data);
    } catch {
      setError("Gagal memuat data penilaian.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [weekDate, sentraDay]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <PageHeader
        title="Penilaian"
        description={
          data
            ? `Pantau kelengkapan penilaian — Tahun Ajaran ${data.academicYear}`
            : "Pantau kelengkapan penilaian walas pekanan & sentra harian"
        }
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end mb-6">
        <Field className="sm:w-48">
          <FieldLabel htmlFor="week-date">Pekan (tanggal acuan)</FieldLabel>
          <Input
            id="week-date"
            type="date"
            value={weekDate}
            onChange={(e) => setWeekDate(e.target.value)}
          />
        </Field>
        <Field className="sm:w-48">
          <FieldLabel htmlFor="sentra-day">Hari sentra</FieldLabel>
          <Input
            id="sentra-day"
            type="date"
            value={sentraDay}
            onChange={(e) => setSentraDay(e.target.value)}
          />
        </Field>
      </div>

      {error ? (
        <EmptyState
          icon={AlertCircle}
          title="Tidak dapat memuat penilaian."
          description={error}
          actionLabel="Coba lagi"
          onAction={load}
        />
      ) : loading ? (
        <div className="space-y-3" aria-busy="true" aria-live="polite">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : data ? (
        <div className="space-y-8">
          {/* Walas weekly */}
          <section aria-labelledby="walas-heading">
            <div className="flex items-center gap-2 mb-3">
              <CalendarDays className="size-4 text-primary" />
              <h2 id="walas-heading" className="text-h2 font-semibold">
                Penilaian Pekanan (Walas)
              </h2>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              {data.week
                ? `Pekan ${data.week.number} · ${data.week.subThemeName} (${data.week.themeName})`
                : "Belum ada Pekan aktif untuk tanggal acuan ini."}
            </p>
            {data.walas.length === 0 ? (
              <EmptyState
                icon={ClipboardList}
                title="Belum ada kelas aktif."
                description="Buat kelas pada tahun ajaran aktif untuk memantau penilaian pekanan."
              />
            ) : (
              <Card className="overflow-hidden p-0">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left">
                    <tr>
                      <th className="p-3 font-medium">Kelas</th>
                      <th className="p-3 font-medium">Program</th>
                      <th className="p-3 font-medium text-right">Kelengkapan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.walas.map((row) => (
                      <tr key={row.classSectionId} className="border-t border-border">
                        <td className="p-3 font-medium">{row.className}</td>
                        <td className="p-3 text-muted-foreground">{row.programName}</td>
                        <td className="p-3 text-right">
                          <CompletionBadge assessed={row.assessed} enrolled={row.enrolled} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </section>

          {/* Sentra daily */}
          <section aria-labelledby="sentra-heading">
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="size-4 text-primary" />
              <h2 id="sentra-heading" className="text-h2 font-semibold">
                Penilaian Sentra Harian
              </h2>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              Entri pada {data.sentraDate}. Sentra tidak memiliki target siswa tetap (rotasi
              fleksibel) — angka menunjukkan jumlah entri & siswa yang dinilai.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {data.sentra.map((row) => (
                <Card key={row.center} className="p-card">
                  <p className="text-sm font-semibold mb-1">{formatLearningCenter(row.center)}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.entries} entri · {row.studentsAssessed} siswa dinilai
                  </p>
                </Card>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
