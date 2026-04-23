import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, MessageCircle, Sparkles, Thermometer, CalendarClock } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ChildSelectorTabs } from "@/components/parent/child-selector-tabs";
import { PageHeader } from "@/components/portal/page-header";
import { getParentWithChildren, resolveSelectedChild } from "@/lib/parent-helpers";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";

const DAY_LABELS = ["Sen", "Sel", "Rab", "Kam", "Jum"] as const;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function mondayOf(d: Date): Date {
  const day = d.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  const m = new Date(d);
  m.setDate(d.getDate() + offset);
  m.setHours(0, 0, 0, 0);
  return m;
}

function weekDates(monday: Date): string[] {
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return ymd(d);
  });
}

function shortMonthDay(ymdStr: string): string {
  const [, m, d] = ymdStr.split("-");
  return `${m}/${d}`;
}

export default async function ParentAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ child?: string; week?: string }>;
}) {
  const session = await getSession();
  if (!session || session.role !== "GUARDIAN") redirect("/");

  const { parent, children } = await getParentWithChildren(session);
  if (!parent || children.length === 0) redirect("/parent");

  const params = await searchParams;
  const selected = resolveSelectedChild(children, params.child);
  if (!selected) redirect("/parent");

  // Determine the focal week (defaults to this week).
  const now = new Date();
  const today = ymd(now);
  const weekParam = params.week;
  const monday = weekParam ? mondayOf(new Date(weekParam + "T00:00:00")) : mondayOf(now);
  const days = weekDates(monday);
  const weekStart = days[0]!;
  const weekEnd = days[days.length - 1]!;

  // Prev / next week links
  const prevMon = new Date(monday);
  prevMon.setDate(monday.getDate() - 7);
  const nextMon = new Date(monday);
  nextMon.setDate(monday.getDate() + 7);
  const childQuery = children.length > 1 ? `&child=${selected.studentId}` : "";

  // Fetch attendance + notes for this kid + this week
  const [attendanceRows, notesRows] = await Promise.all([
    prisma.studentAttendance.findMany({
      where: {
        studentId: selected.studentId,
        date: { in: days },
        isVoided: false,
        student: session.tenantId ? { tenantId: session.tenantId } : undefined,
      },
      select: { date: true, status: true, notes: true },
    }),
    session.tenantId
      ? prisma.studentJournalNote.findMany({
          where: {
            tenantId: session.tenantId,
            studentId: selected.studentId,
            status: "ACTIVE",
            date: { gte: weekStart, lte: weekEnd },
          },
          orderBy: { date: "desc" },
          select: { id: true, date: true, body: true, authorRole: true },
        })
      : Promise.resolve([] as { id: string; date: string; body: string; authorRole: string }[]),
  ]);

  const statusByDate = new Map<string, string>();
  const noteByDate = new Map<string, string>();
  for (const r of attendanceRows) statusByDate.set(r.date, r.status);
  for (const r of attendanceRows) {
    if (r.notes && r.notes.trim().length > 0) noteByDate.set(r.date, r.notes.trim());
  }

  // Aggregate counts for the summary card
  let hadir = 0, sakit = 0, alpa = 0, izin = 0, logged = 0;
  for (const d of days) {
    const s = statusByDate.get(d);
    if (!s) continue;
    logged += 1;
    if (s === "PRESENT") hadir += 1;
    else if (s === "SICK") sakit += 1;
    else if (s === "ABSENT") alpa += 1;
    else if (s === "PERMISSION") izin += 1;
  }
  const allPresent = logged === 5 && hadir === 5;
  const hasAttention = sakit > 0 || alpa > 0;

  const childTabsData = children.map((c) => ({
    studentId: c.studentId,
    studentName: c.studentName,
    className: c.className,
  }));

  const childName = selected.studentNickname ?? selected.studentName.split(" ")[0];
  const weekRangeLabel = `${formatDate(weekStart, { day: "numeric", month: "short" })} – ${formatDate(weekEnd, { day: "numeric", month: "short", year: "numeric" })}`;

  return (
    <div className="space-y-6 pb-4">
      <ChildSelectorTabs items={childTabsData} selectedChildId={selected.studentId} sticky />

      <PageHeader title="Kehadiran" subtitle="Pantau kehadiran harian anak" />

      {/* Summary card — varies by week state */}
      {allPresent ? (
        <section
          className="rounded-xl border p-4"
          style={{
            background: "var(--celebration-gold-subtle)",
            borderColor: "var(--celebration-gold)",
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="grid size-10 place-items-center rounded-lg"
              style={{
                background: "var(--celebration-gold-subtle)",
                color: "var(--celebration-gold-text)",
              }}
            >
              <Sparkles size={18} />
            </div>
            <div>
              <p
                className="text-sm font-semibold"
                style={{ color: "var(--celebration-gold-text)" }}
              >
                Hadir 5 dari 5 hari
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Alhamdulillah, {childName} hadir penuh pekan ini.
              </p>
            </div>
          </div>
        </section>
      ) : hasAttention ? (
        <section
          className="rounded-xl border p-4"
          style={{
            background: "var(--status-late-subtle)",
            borderColor: "var(--status-late)",
          }}
        >
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-lg bg-status-late-subtle text-status-late-text">
              <Thermometer size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold text-status-late-text">
                Hadir {hadir} · Sakit {sakit} · Alpa {alpa}
                {izin > 0 ? ` · Izin ${izin}` : ""}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {childName} istirahat dulu, semoga lekas sehat.
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {/* Week navigator */}
      <div className="flex items-center justify-between">
        <Link
          href={`/parent/attendance?week=${ymd(prevMon)}${childQuery}`}
          className="grid size-11 place-items-center rounded-md text-foreground transition-colors hover:bg-primary/10 active:bg-primary/20"
          aria-label="Pekan sebelumnya"
        >
          <ChevronLeft size={20} />
        </Link>
        <span className="text-sm font-medium text-foreground">{weekRangeLabel}</span>
        <Link
          href={`/parent/attendance?week=${ymd(nextMon)}${childQuery}`}
          className="grid size-11 place-items-center rounded-md text-foreground transition-colors hover:bg-primary/10 active:bg-primary/20"
          aria-label="Pekan berikutnya"
        >
          <ChevronRight size={20} />
        </Link>
      </div>

      {/* Week grid */}
      {logged === 0 && days.every((d) => d > today) ? (
        <EmptyState
          accent="warm"
          icon={CalendarClock}
          title="Pekan ini belum dimulai"
          description="Catatan kehadiran muncul setiap pagi setelah Ustadzah merekap absensi kelas."
        />
      ) : logged === 0 ? (
        <EmptyState
          accent="warm"
          icon={CalendarClock}
          title="Belum ada catatan kehadiran"
          description="Insyaallah akan muncul setelah Ustadzah mengisi absensi."
        />
      ) : (
        <div className="overflow-x-auto -mx-page-x px-page-x">
          <table className="w-full min-w-[324px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 w-[80px] min-w-[80px] bg-card py-2 pr-2 text-left text-xs font-medium text-muted-foreground">
                  Status
                </th>
                {days.map((d, i) => {
                  const isToday = d === today;
                  return (
                    <th
                      key={d}
                      className={`w-[44px] min-w-[44px] py-2 px-1 text-center text-xs ${isToday ? "border-t-2 border-primary bg-status-present-subtle font-semibold text-primary" : "font-medium text-muted-foreground"}`}
                    >
                      <div>{DAY_LABELS[i] ?? ""}</div>
                      <div className={`text-[9px] font-normal ${isToday ? "text-primary/80" : "text-muted-foreground/70"}`}>
                        {shortMonthDay(d)}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border/40">
                <td className="sticky left-0 z-10 bg-card py-2 pr-2 text-xs text-foreground">
                  Hadir
                </td>
                {days.map((d) => {
                  const isToday = d === today;
                  const status = statusByDate.get(d);
                  const isFuture = d > today;
                  return (
                    <td
                      key={d}
                      className={`p-0 text-center align-middle ${isToday ? "bg-status-present-subtle border-b-2 border-primary" : ""}`}
                    >
                      <span className="inline-flex h-9 w-9 items-center justify-center">
                        {status === "PRESENT" ? (
                          <Check size={16} strokeWidth={2.5} className="text-primary" />
                        ) : status === "SICK" ? (
                          <span className="text-xs font-bold text-status-late-text">S</span>
                        ) : status === "ABSENT" ? (
                          <span className="text-xs font-bold text-status-absent-text">A</span>
                        ) : status === "PERMISSION" ? (
                          <span className="text-xs font-bold text-status-leave-text">I</span>
                        ) : isFuture ? (
                          <span className="text-muted-foreground/40">·</span>
                        ) : (
                          <span className="block size-3.5 rounded-sm border border-muted-foreground/30" />
                        )}
                      </span>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span><Check className="inline size-3 text-primary align-middle" /> Hadir</span>
            <span><b className="text-status-late-text">S</b> Sakit</span>
            <span><b className="text-status-absent-text">A</b> Alpa</span>
            <span><b className="text-status-leave-text">I</b> Izin</span>
          </div>
        </div>
      )}

      {/* Notes from school this week */}
      {notesRows.length > 0 ? (
        <section>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Catatan dari sekolah
          </p>
          <ul className="space-y-2">
            {notesRows.map((n) => (
              <li
                key={n.id}
                className="flex items-start gap-3 rounded-xl border border-border bg-card p-4"
              >
                <div className="grid size-10 place-items-center shrink-0 rounded-lg bg-status-leave-subtle text-status-leave-text">
                  <MessageCircle size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground line-clamp-3">{n.body}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {n.authorRole === "TEACHER" ? "Ustadzah" : "Anda"} ·{" "}
                    {formatDate(n.date, { day: "numeric", month: "long" })}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
