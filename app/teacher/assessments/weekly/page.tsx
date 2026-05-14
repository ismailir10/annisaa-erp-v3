import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { CalendarOff, ClipboardList } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { getTodayInTimezone } from "@/lib/attendance/timezone";
import { loadWeeklyAssessment } from "@/lib/curriculum/weekly-assessment-loader";
import { WeeklyClient } from "./client";

const JAKARTA_TZ = "Asia/Jakarta";

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
  const dateParam = params.date ?? getTodayInTimezone(JAKARTA_TZ);

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
          title="Belum ada Pekan aktif"
          description={data.message}
        />
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
