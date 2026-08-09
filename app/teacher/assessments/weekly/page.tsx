import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { CalendarOff, ClipboardList } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { getTodayInTimezone } from "@/lib/attendance/timezone";
import { loadWeeklyAssessment } from "@/lib/curriculum/weekly-assessment-loader";
import { WeeklyClient } from "./client";
import { Button } from "@/components/ui/button";

const JAKARTA_TZ = "Asia/Jakarta";

export function normalizeWeeklyDate(value: string | undefined, fallback: string): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value
    ? fallback
    : value;
}

export function WeeklyDateRecovery({ date }: { date: string }) {
  return (
    <form action="/teacher/assessments/weekly" method="get" className="space-y-3">
      <label htmlFor="weekly-recovery-date" className="block text-sm font-medium">
        Pilih tanggal lain
      </label>
      <input
        id="weekly-recovery-date"
        name="date"
        type="date"
        defaultValue={date}
        required
        className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      />
      <Button type="submit" className="min-h-11 w-full">Lihat penilaian</Button>
    </form>
  );
}

export default async function TeacherAssessmentsWeeklyPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await getSession();
  if (!session || session.role !== "TEACHER") redirect("/");
  if (!session.tenantId || !session.employeeId) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="Akun belum terhubung dengan staf"
        description="Hubungi admin agar akun Anda dipasangkan dengan data karyawan."
      />
    );
  }

  const params = await searchParams;
  const dateParam = normalizeWeeklyDate(
    params.date,
    getTodayInTimezone(JAKARTA_TZ),
  );

  const data = await loadWeeklyAssessment(
    session.tenantId,
    session.employeeId,
    dateParam,
  );

  if (!data.ok) {
    if (data.reason === "not_homeroom") {
      return (
        <EmptyState
          icon={ClipboardList}
          title="Belum jadi walas"
          description={data.message}
        />
      );
    }
    if (data.reason === "no_active_year") {
      return (
        <EmptyState
          icon={CalendarOff}
          title="Tahun ajaran belum aktif"
          description={data.message}
        />
      );
    }
    // no_active_week — still tell walas which classroom they're walas of
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-semibold">
          Penilaian Pekanan — {data.classSection.name}
        </h1>
        <EmptyState
          icon={CalendarOff}
          title="Belum ada pekan aktif"
          description={data.message}
        />
        <WeeklyDateRecovery date={dateParam} />
      </div>
    );
  }

  return (
    <WeeklyClient
      initialDate={dateParam}
      week={data.week}
      classSection={data.classSection}
      students={data.students}
      indicators={data.indicators}
      initialEntries={data.entries}
    />
  );
}
