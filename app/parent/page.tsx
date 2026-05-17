import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Sparkles,
  Receipt,
  AlertCircle,
  ChevronRight,
  LineChart,
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { KidCard, type KidCardDay, type KidCardFoot } from "@/components/parent/kid-card";
import { getParentOutstandingForStudents, getParentWithChildren } from "@/lib/parent-helpers";
import { prisma } from "@/lib/db";
import {
  formatRupiah,
  formatDate,
  formatCurriculumElement,
  formatLearningCenter,
} from "@/lib/format";
import { formatHijri, timeOfDayGreeting } from "@/lib/hijri";
import { getYmdInTimezone } from "@/lib/attendance/timezone";
import { loadStudentPerkembangan } from "@/lib/curriculum/perkembangan-loader";

const LEVEL_LABEL: Record<string, string> = {
  CONSISTENT: "Mampu",
  EMERGING: "Belum",
  NEEDS_REINFORCEMENT: "Perlu",
};

const LEVEL_BG: Record<string, string> = {
  CONSISTENT: "bg-status-present-subtle text-status-present-text",
  EMERGING: "bg-status-late/10 text-status-late",
  NEEDS_REINFORCEMENT: "bg-status-absent/10 text-status-absent",
};

const DAY_LABELS = ["Sen", "Sel", "Rab", "Kam", "Jum"] as const;
const JAKARTA_TZ = "Asia/Jakarta";

function ymd(d: Date): string {
  return getYmdInTimezone(d, JAKARTA_TZ);
}

/**
 * Mon-Fri YYYY-MM-DD strings for the Jakarta-local week containing `now`.
 * Anchored on the WIB calendar day, not the server's UTC day — without this
 * a request arriving between 17:00-23:59 UTC (= 00:00-06:59 WIB next day)
 * would compute Monday off the wrong base date.
 */
function thisWeekDates(now: Date = new Date()): string[] {
  // Anchor to WIB-local midnight by parsing the YMD string back through Date.
  const todayYmd = getYmdInTimezone(now, JAKARTA_TZ); // e.g. "2026-05-14"
  const [yearStr, monthStr, dayStr] = todayYmd.split("-");
  // Construct a UTC date for the WIB calendar day at noon — noon avoids
  // both DST boundaries (n/a here) and any sub-day timezone-shift surprises.
  const anchor = new Date(Date.UTC(
    Number(yearStr),
    Number(monthStr) - 1,
    Number(dayStr),
    12, 0, 0,
  ));
  const day = anchor.getUTCDay(); // 0=Sun..6=Sat — same in any TZ because anchor is at noon UTC
  const offsetToMon = day === 0 ? -6 : 1 - day;
  const monday = new Date(anchor);
  monday.setUTCDate(anchor.getUTCDate() + offsetToMon);
  const out: string[] = [];
  for (let i = 0; i < 5; i += 1) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    out.push(getYmdInTimezone(d, JAKARTA_TZ));
  }
  return out;
}

function attendanceToDayStatus(
  status: string | undefined,
): "present" | "absent" | "sick" | "leave" | "missing" {
  if (status === "PRESENT") return "present";
  if (status === "ABSENT") return "absent";
  if (status === "SICK") return "sick";
  if (status === "PERMISSION") return "leave";
  return "missing";
}

function buildKidFoot(
  todayStatus: string | undefined,
  weekCounts: { hadir: number; sakit: number; alpa: number; izin: number; logged: number },
  latestNote: { body: string; createdAt: Date } | null,
  now: Date,
): KidCardFoot {
  if (todayStatus === "SICK") {
    return { tone: "warn", icon: "thermometer", text: "Sakit hari ini · semoga lekas sehat" };
  }
  if (todayStatus === "ABSENT") {
    return { tone: "warn", icon: "thermometer", text: "Tidak hadir hari ini" };
  }
  if (todayStatus === "PERMISSION") {
    return { tone: "info", icon: "message-circle", text: "Izin hari ini" };
  }
  if (latestNote) {
    const ageMs = now.getTime() - latestNote.createdAt.getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays <= 14) {
      const trimmed = latestNote.body.trim();
      const excerpt = trimmed.length > 56 ? `${trimmed.slice(0, 53)}…` : trimmed;
      return { tone: "info", icon: "message-circle", text: `"${excerpt}"` };
    }
  }
  if (weekCounts.hadir > 0 && weekCounts.sakit === 0 && weekCounts.alpa === 0 && weekCounts.izin === 0) {
    return { tone: "ok", icon: "check", text: `Hadir ${weekCounts.hadir} hari pekan ini` };
  }
  if (weekCounts.logged > 0) {
    const parts: string[] = [];
    if (weekCounts.hadir) parts.push(`Hadir ${weekCounts.hadir}`);
    if (weekCounts.sakit) parts.push(`Sakit ${weekCounts.sakit}`);
    if (weekCounts.alpa) parts.push(`Alpa ${weekCounts.alpa}`);
    if (weekCounts.izin) parts.push(`Izin ${weekCounts.izin}`);
    const tone: KidCardFoot["tone"] =
      weekCounts.sakit + weekCounts.alpa > 0 ? "warn" : "info";
    return { tone, icon: "check", text: `${parts.join(" · ")} pekan ini` };
  }
  return { tone: "info", icon: "check", text: "Pekan ini belum tercatat" };
}

export default async function ParentDashboard() {
  const session = await getSession();
  if (!session || session.role !== "GUARDIAN" || !session.tenantId) redirect("/");

  const { parent, children } = await getParentWithChildren(session);

  if (!parent || children.length === 0) {
    return (
      <div className="py-16">
        <EmptyState
          icon={AlertCircle}
          title="Akun belum terhubung ke anak"
          description="Silakan hubungi admin sekolah untuk menghubungkan akun Anda."
        />
      </div>
    );
  }

  const now = new Date();
  const today = ymd(now);
  const week = thisWeekDates(now);
  const kidIds = children.map((c) => c.studentId);

  const [
    weekAttendance,
    latestNotes,
    outstanding,
    perkembanganByKid,
  ] = await Promise.all([
    prisma.studentAttendance.findMany({
      where: {
        studentId: { in: kidIds },
        date: { in: week },
        isVoided: false,
        student: { tenantId: session.tenantId },
      },
      select: { studentId: true, date: true, status: true },
    }),
    prisma.studentJournalNote.findMany({
      where: {
        tenantId: session.tenantId,
        studentId: { in: kidIds },
        status: "ACTIVE",
      },
      orderBy: { createdAt: "desc" },
      select: { studentId: true, body: true, createdAt: true },
    }),
    getParentOutstandingForStudents(kidIds, session.tenantId),
    // Per-kid perkembangan rollup — drives the "Perkembangan minggu ini"
    // card section below. Fan out across children in parallel; the
    // loader itself is two cheap queries per kid (semester + entries
    // joined on indicator.objective.semesterId), so the round-trip
    // count stays bounded by the active-children count.
    Promise.all(
      kidIds.map((id) =>
        loadStudentPerkembangan(session.tenantId as string, id).then(
          (data) => [id, data] as const,
        ),
      ),
    ).then((rows) => new Map(rows)),
  ]);

  // Index attendance: studentId → (date → status)
  const attendanceByKid = new Map<string, Map<string, string>>();
  for (const r of weekAttendance) {
    const inner = attendanceByKid.get(r.studentId) ?? new Map<string, string>();
    inner.set(r.date, r.status);
    attendanceByKid.set(r.studentId, inner);
  }

  // Latest note per kid (notes already ordered desc by createdAt)
  const latestNoteByKid = new Map<string, { body: string; createdAt: Date }>();
  for (const n of latestNotes) {
    if (!latestNoteByKid.has(n.studentId)) {
      latestNoteByKid.set(n.studentId, { body: n.body, createdAt: n.createdAt });
    }
  }

  const { count: unpaidCount, total: unpaidTotal, nearestDue } = outstanding;

  const greetingFirst = parent.name.split(" ")[0] ?? parent.name;
  // Derive Bu/Pak from the guardian relationship label on the first child link.
  // (Parent model has no gender field; relationship is MOTHER / FATHER / GUARDIAN.)
  const firstRel = children[0]?.relationship?.toUpperCase() ?? "";
  const honorific = firstRel === "FATHER" ? "Pak" : "Bu";
  const greetingTitle = `Assalamu'alaikum, ${honorific} ${greetingFirst}`;
  const tod = timeOfDayGreeting(now);
  const dateLine = formatDate(today, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const hijri = formatHijri(now);

  // Build KidCard data per child
  const kids = children.map((c) => {
    const attMap = attendanceByKid.get(c.studentId) ?? new Map<string, string>();
    const todayStatus = attMap.get(today);
    const counts = { hadir: 0, sakit: 0, alpa: 0, izin: 0, logged: 0 };
    const days: KidCardDay[] = week.map((d, i) => {
      const status = attMap.get(d);
      if (status === "PRESENT") counts.hadir += 1;
      else if (status === "SICK") counts.sakit += 1;
      else if (status === "ABSENT") counts.alpa += 1;
      else if (status === "PERMISSION") counts.izin += 1;
      if (status) counts.logged += 1;
      const isFuture = d > today;
      return {
        label: DAY_LABELS[i] ?? "",
        isToday: d === today,
        status: isFuture
          ? "future"
          : attendanceToDayStatus(status),
      };
    });
    const foot = buildKidFoot(todayStatus, counts, latestNoteByKid.get(c.studentId) ?? null, now);
    const displayName = c.studentNickname ?? c.studentName.split(" ").slice(0, 2).join(" ");
    return {
      id: c.studentId,
      name: displayName,
      className: c.className ?? "—",
      week: days,
      foot,
    };
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {greetingTitle}
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Selamat {tod} · {dateLine}
          {hijri ? (
            <span className="text-celebration-gold-text/85"> · {hijri}</span>
          ) : null}
        </p>
      </header>

      <section>
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Anak Anda
        </p>
        <div className="space-y-3">
          {kids.map((k) => (
            <KidCard
              key={k.id}
              id={k.id}
              name={k.name}
              className={k.className}
              week={k.week}
              foot={k.foot}
            />
          ))}
        </div>
      </section>

      {(() => {
        // Per-kid perkembangan cards — hidden when no kid has any
        // entries this week so the home stays calm on quiet days.
        const perkembanganKids = children
          .map((c) => ({
            child: c,
            data: perkembanganByKid.get(c.studentId),
          }))
          .filter(
            (row): row is { child: typeof row.child; data: NonNullable<typeof row.data> } =>
              !!row.data &&
              row.data.hasActiveWeek &&
              row.data.latestThisWeek.length > 0,
          );
        if (perkembanganKids.length === 0) return null;
        return (
          <section data-testid="home-perkembangan-section">
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Perkembangan minggu ini
            </p>
            <div className="space-y-3">
              {perkembanganKids.map(({ child, data }) => {
                const displayName =
                  child.studentNickname ??
                  child.studentName.split(" ").slice(0, 2).join(" ");
                return (
                  <Link
                    key={child.studentId}
                    href={`/parent/perkembangan/${child.studentId}`}
                    data-testid={`home-perkembangan-card-${child.studentId}`}
                    className="block rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30 active:border-primary/40 md:p-6"
                  >
                    <div className="flex items-center gap-3">
                      <div className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
                        <LineChart size={18} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate">
                          {displayName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {data.latestThisWeek.length} catatan pekan ini
                        </p>
                      </div>
                      <ChevronRight
                        size={18}
                        className="shrink-0 text-muted-foreground"
                      />
                    </div>
                    <ul className="mt-3 space-y-1.5">
                      {data.latestThisWeek.slice(0, 3).map((entry, idx) => (
                        <li
                          key={`${entry.date}-${entry.indicatorContent}-${idx}`}
                          className="flex items-start justify-between gap-2"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-muted-foreground">
                              {formatCurriculumElement(entry.element)}
                              {entry.source === "CENTER" && entry.center && (
                                <> · {formatLearningCenter(entry.center)}</>
                              )}
                            </p>
                            <p className="text-xs text-foreground truncate">
                              {entry.indicatorContent}
                            </p>
                          </div>
                          <span
                            className={`shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium ${LEVEL_BG[entry.level] ?? ""}`}
                          >
                            {LEVEL_LABEL[entry.level] ?? entry.level}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })()}

      <section>
        {unpaidTotal > 0 ? (
          <>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Tagihan
            </p>
            <Link
              href="/parent/invoices"
              className="block rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30 active:border-primary/40 md:p-6"
            >
              <div className="flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-lg bg-status-absent-subtle text-status-absent-text">
                  <Receipt size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-currency text-lg sm:text-xl font-semibold leading-none tracking-tight text-status-absent-text">
                    {formatRupiah(unpaidTotal)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {unpaidCount} tagihan belum dibayar
                    {nearestDue ? (
                      <>
                        {" · jatuh tempo terdekat "}
                        {formatDate(nearestDue, { day: "numeric", month: "long" })}
                      </>
                    ) : null}
                  </p>
                </div>
                <ChevronRight size={18} className="shrink-0 text-muted-foreground" />
              </div>
            </Link>
          </>
        ) : (
          <>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Pekan ini
            </p>
            <div className="rounded-xl border border-celebration-gold bg-celebration-gold-subtle p-4 md:p-6">
              <div className="flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-lg bg-celebration-gold-subtle text-celebration-gold-text">
                  <Sparkles size={18} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-celebration-gold-text">
                    Lunas semua
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Jazakumullahu khairan. Insyaallah tagihan berikutnya muncul saat sekolah menerbitkannya.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
