import {
  Home,
  Receipt,
  CalendarDays,
  BookHeart,
  LineChart,
  BookOpen,
  MoreHorizontal,
  Users,
  NotebookPen,
  User,
  ChevronRight,
  Sparkles,
  LogOut,
} from "lucide-react";
import { KidCard } from "@/components/parent/kid-card";
import { MockBottomNav, type MockNavItem } from "./mock-nav";

/**
 * THROWAWAY MOCKUP ROUTE — `/nav-proposal?v=…`. Not linked from anywhere,
 * not shipped. Exists only so the parent-portal bottom-nav options can be
 * rendered headlessly at 375 px and screenshotted for owner review.
 *
 * No auth, no DB, no network — every value below is hardcoded so the route
 * renders identically on any machine.
 *
 * Delete this directory before any real implementation cycle.
 */

const WEEK = [
  { label: "Sen", status: "present" as const, isToday: false },
  { label: "Sel", status: "present" as const, isToday: false },
  { label: "Rab", status: "sick" as const, isToday: true },
  { label: "Kam", status: "future" as const, isToday: false },
  { label: "Jum", status: "future" as const, isToday: false },
];

function MockHeader() {
  return (
    <header className="sticky top-0 z-20 bg-card border-b border-border">
      <div className="max-w-md mx-auto flex items-center justify-between px-5 h-14">
        <div className="flex items-center gap-2.5">
          <div className="size-7 rounded-md bg-primary/15 grid place-items-center text-xs font-bold text-primary">
            AN
          </div>
          <span className="text-sm font-semibold text-foreground">Talib</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-2 py-1">
            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-xs font-bold text-primary">SW</span>
            </div>
            <span className="text-xs font-medium text-foreground">Siti</span>
          </div>
          <div className="p-2 rounded-lg text-muted-foreground">
            <LogOut size={16} />
          </div>
        </div>
      </div>
    </header>
  );
}

/** Faithful static copy of the shipped `/parent` home body. */
function HomeBody() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Assalamu&apos;alaikum, Bu Siti
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Selamat pagi · Rabu, 1 Agustus 2026
          <span className="text-celebration-gold-text/85"> · 17 Safar 1448</span>
        </p>
      </header>

      <section>
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Anak Anda
        </p>
        <div className="space-y-3">
          <KidCard
            id="a"
            name="Aisyah"
            className="TKIT B"
            week={WEEK}
            foot={{ tone: "warn", icon: "thermometer", text: "Sakit hari ini · semoga lekas sehat" }}
          />
          <KidCard
            id="b"
            name="Zaid"
            className="TKIT A"
            week={WEEK.map((d) => ({ ...d, status: d.status === "sick" ? ("present" as const) : d.status }))}
            foot={{ tone: "info", icon: "message-circle", text: '"Zaid hari ini berani bercerita di depan kelas"' }}
          />
        </div>
      </section>

      <section>
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Tagihan
        </p>
        <div className="block rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-lg bg-status-absent-subtle text-status-absent-text">
              <Receipt size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-currency text-lg font-semibold leading-none tracking-tight text-status-absent-text">
                Rp 1.850.000
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                2 tagihan belum dibayar · jatuh tempo terdekat 10 Agustus
              </p>
            </div>
            <ChevronRight size={18} className="shrink-0 text-muted-foreground" />
          </div>
        </div>
      </section>
    </div>
  );
}

function SectionRow({
  icon: Icon,
  title,
  meta,
  tone = "primary",
}: {
  icon: typeof Home;
  title: string;
  meta: string;
  tone?: "primary" | "gold";
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
      <div
        className={
          tone === "gold"
            ? "grid size-10 place-items-center rounded-lg bg-celebration-gold-subtle text-celebration-gold-text"
            : "grid size-10 place-items-center rounded-lg bg-primary/10 text-primary"
        }
      >
        <Icon size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{meta}</p>
      </div>
      <ChevronRight size={18} className="shrink-0 text-muted-foreground" />
    </div>
  );
}

/** Option A overflow sheet, drawn over a dimmed home. */
function LainnyaSheet() {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" />
      <div className="fixed bottom-0 inset-x-0 z-50 rounded-t-2xl border-t border-border bg-card pb-20">
        <div className="mx-auto max-w-md px-page-x pt-3">
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" />
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Lainnya
          </p>
          <div className="space-y-2">
            <SectionRow icon={LineChart} title="Capaian" meta="Perkembangan per elemen · 4 catatan pekan ini" />
            <SectionRow icon={BookOpen} title="Rapor" meta="Semester 1 2025/2026 · terbit 20 Des" tone="gold" />
            <SectionRow icon={User} title="Profil" meta="Data akun & kontak" />
          </div>
        </div>
      </div>
    </>
  );
}

/** Option B — merged "Catatan" surface with in-page sub-tabs. */
function CatatanBody() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Catatan</h1>
        <p className="mt-1 text-xs text-muted-foreground">Rekam harian anak di sekolah</p>
      </div>

      {/* child switcher — existing PortalTabs pills */}
      <div className="flex gap-2">
        <span className="rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
          Aisyah
        </span>
        <span className="rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">
          Zaid
        </span>
      </div>

      {/* merged sub-tabs — underline variant */}
      <div className="flex gap-5 border-b border-border">
        <span className="-mb-px border-b-2 border-primary pb-2 text-xs font-semibold text-primary">
          Kehadiran
        </span>
        <span className="-mb-px border-b-2 border-transparent pb-2 text-xs font-medium text-muted-foreground">
          Penghubung
        </span>
        <span className="-mb-px border-b-2 border-transparent pb-2 text-xs font-medium text-muted-foreground">
          Capaian
        </span>
      </div>

      <div className="space-y-3 pt-1">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Pekan ini
          </p>
          <div className="mt-3 grid grid-cols-5 gap-1">
            {WEEK.map((d) => (
              <div
                key={d.label}
                className={
                  d.isToday
                    ? "flex h-11 flex-col items-center justify-center rounded-md bg-primary text-xs font-semibold text-primary-foreground"
                    : d.status === "present"
                      ? "flex h-11 flex-col items-center justify-center rounded-md bg-status-present-subtle text-xs font-semibold text-status-present-text"
                      : "flex h-11 flex-col items-center justify-center rounded-md border border-dashed border-border text-xs font-semibold text-muted-foreground/50"
                }
              >
                <span className="mb-0.5 opacity-70">{d.label}</span>
                <span>{d.isToday ? "S" : d.status === "present" ? "✓" : "·"}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 border-t border-border pt-2 text-xs text-muted-foreground">
            Hadir 2 · Sakit 1 pekan ini
          </p>
        </div>
        <SectionRow icon={CalendarDays} title="Agustus 2026" meta="Hadir 18 · Sakit 1 · Izin 0" />
      </div>
    </div>
  );
}

/** Option C — per-child hub. */
function AnakBody() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Aisyah</h1>
        <p className="mt-1 text-xs text-muted-foreground">TKIT B · Taman Aster</p>
      </div>

      <div className="flex gap-2">
        <span className="rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
          Aisyah
        </span>
        <span className="rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">
          Zaid
        </span>
      </div>

      <div className="rounded-xl border border-status-late bg-status-late-subtle p-4">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-lg bg-status-late-subtle text-status-late-text">
            <Sparkles size={18} />
          </div>
          <div>
            <p className="text-sm font-semibold text-status-late-text">Sakit hari ini</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Semoga lekas sehat</p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <SectionRow icon={CalendarDays} title="Kehadiran" meta="Hadir 18 dari 19 hari bulan ini" />
        <SectionRow icon={BookHeart} title="Penghubung" meta="2 catatan baru dari Bu Sari" />
        <SectionRow icon={LineChart} title="Capaian" meta="4 catatan perkembangan pekan ini" />
        <SectionRow icon={BookOpen} title="Rapor" meta="Semester 1 · terbit 20 Des" tone="gold" />
      </div>
    </div>
  );
}

const CURRENT: MockNavItem[] = [
  { label: "Beranda", icon: "home", active: true },
  { label: "Tagihan", icon: "receipt" },
  { label: "Kehadiran", icon: "calendar" },
  { label: "Penghubung", icon: "journal" },
  { label: "Capaian", icon: "chart" },
  { label: "Rapor", icon: "report" },
];

const OPTION_A: MockNavItem[] = [
  { label: "Beranda", icon: "home", active: true },
  { label: "Tagihan", icon: "receipt" },
  { label: "Kehadiran", icon: "calendar" },
  { label: "Pesan", icon: "journal" },
  { label: "Lainnya", icon: "more" },
];

const OPTION_B: MockNavItem[] = [
  { label: "Beranda", icon: "home" },
  { label: "Catatan", icon: "notes", active: true },
  { label: "Tagihan", icon: "receipt" },
  { label: "Rapor", icon: "report" },
  { label: "Profil", icon: "profile" },
];

const OPTION_C: MockNavItem[] = [
  { label: "Beranda", icon: "home" },
  { label: "Anak", icon: "kids", active: true },
  { label: "Tagihan", icon: "receipt" },
  { label: "Lainnya", icon: "more" },
];

type Variant = "current" | "a" | "a-sheet" | "b" | "c";

const VARIANTS: Record<Variant, { nav: MockNavItem[]; body: React.ReactNode; sheet?: boolean }> = {
  current: { nav: CURRENT, body: <HomeBody /> },
  a: { nav: OPTION_A, body: <HomeBody /> },
  "a-sheet": { nav: OPTION_A, body: <HomeBody />, sheet: true },
  b: { nav: OPTION_B, body: <CatatanBody /> },
  c: { nav: OPTION_C, body: <AnakBody /> },
};

export default async function NavProposalPage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string }>;
}) {
  const { v } = await searchParams;
  const key: Variant = (v as Variant) in VARIANTS ? (v as Variant) : "current";
  const variant = VARIANTS[key];

  return (
    <div className="min-h-screen bg-background pb-20">
      <MockHeader />
      <main className="max-w-md mx-auto px-page-x py-6">{variant.body}</main>
      {variant.sheet ? <LainnyaSheet /> : null}
      <MockBottomNav items={variant.nav} />
    </div>
  );
}
