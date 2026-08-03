/**
 * seed-demo-curriculum.ts — representative curriculum content for STAGING.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/seed-demo-curriculum.ts [--commit]
 *
 * Dry-run by default. Refuses to run against the production database.
 *
 * Why this exists: the penilaian flow (walas Pekanan + sentra Harian) is
 * code-complete but shows an empty picker without curriculum content —
 * Theme/SubTheme/Week for the date being assessed, LearningObjective +
 * AchievementIndicator for the class's age group, and an
 * IndicatorThemeLink joining the two. Testers need all of it before they
 * can exercise anything. The real PROMES workbooks belong to the school
 * and go to production via `docs/runbooks/prod-curriculum-content-load.md`;
 * this script is the stand-in so staging is walkable in the meantime.
 *
 * Everything it writes is suffixed "(Demo)" so it is obvious in the UI and
 * greppable in the DB. Idempotent: re-running matches on natural keys and
 * creates nothing the second time.
 *
 * Staging calendar caveat: the demo tenant's ACTIVE academic year is
 * 2025/2026 (ends 2026-06-19) but real time has moved past it, and the
 * 2026/2027 year is PLANNING with no classes or enrolments. Rather than
 * mutate the shared demo year (attendance, promotion and enrolment specs
 * key off its dates), this script creates its Semester + Week brackets
 * around *today* so `getCurrentWeek` resolves. That leaves the semester
 * window outside its parent year's window — a deliberate staging-only
 * artifact, called out by `scripts/verify-curriculum-readiness.ts`.
 */

import { prisma } from "../lib/db";

/** Supabase project ref of production — hard block. */
const PROD_DB_REF = "vxwywmvpxetdgnxejjgk";
const TENANT_ID = "t_annisaa";
const DEMO_SUFFIX = "(Demo)";

/** 8 Mon–Fri weeks starting the Monday of the week containing this date. */
const WEEK_COUNT = 8;

interface DemoIndicator {
  content: string;
  /** Theme names this IKTP is taught through. */
  themes: string[];
}

interface DemoObjective {
  element:
    | "RELIGIOUS_MORAL"
    | "IDENTITY"
    | "STEAM"
    | "MOTOR_SKILLS"
    | "ART";
  number: number;
  competencyText: string;
  content: string;
  indicators: DemoIndicator[];
}

const THEME_A = `Diriku ${DEMO_SUFFIX}`;
const THEME_B = `Lingkunganku ${DEMO_SUFFIX}`;

/**
 * Two themes × two sub-themes each. Objectives mirror the 5 Kurikulum
 * Merdeka PAUD elements so the raport aggregator has every section
 * populated (PERFORMANCE_SHOWCASE pools MOTOR_SKILLS + ART).
 */
const DEMO_OBJECTIVES: DemoObjective[] = [
  {
    element: "RELIGIOUS_MORAL",
    number: 1,
    competencyText:
      "Anak mengenal Allah SWT melalui ciptaan-Nya dan membiasakan ibadah harian",
    content:
      "Anak terbiasa mengucap kalimat thayyibah dan menjalankan adab harian sesuai tuntunan",
    indicators: [
      { content: "Mengucap basmalah sebelum memulai kegiatan", themes: [THEME_A, THEME_B] },
      { content: "Menyebutkan ciptaan Allah di sekitarnya", themes: [THEME_B] },
      { content: "Mempraktikkan gerakan wudhu secara berurutan", themes: [THEME_A] },
    ],
  },
  {
    element: "IDENTITY",
    number: 1,
    competencyText:
      "Anak mengenali identitas diri dan mampu menjaga keselamatan dirinya",
    content:
      "Anak dapat menyebutkan identitas diri dan menunjukkan kemandirian dalam kegiatan harian",
    indicators: [
      { content: "Menyebutkan nama lengkap dan nama panggilannya", themes: [THEME_A] },
      { content: "Merapikan alat main setelah selesai digunakan", themes: [THEME_A, THEME_B] },
      { content: "Menyampaikan keinginan dengan kalimat sederhana", themes: [THEME_B] },
    ],
  },
  {
    element: "STEAM",
    number: 1,
    competencyText:
      "Anak menunjukkan rasa ingin tahu melalui eksplorasi dan literasi awal",
    content:
      "Anak mengenal konsep bilangan, bentuk, dan simbol melalui kegiatan bermain",
    indicators: [
      { content: "Membilang benda 1–10 dengan menunjuk", themes: [THEME_A, THEME_B] },
      { content: "Mengelompokkan benda berdasarkan warna atau bentuk", themes: [THEME_B] },
      { content: "Menceritakan kembali isi buku cerita dengan bahasanya sendiri", themes: [THEME_A] },
    ],
  },
  {
    element: "MOTOR_SKILLS",
    number: 1,
    competencyText:
      "Anak menggunakan motorik kasar dan halus secara terkoordinasi",
    content:
      "Anak melakukan gerakan terkoordinasi dan menggunakan alat tulis dengan tepat",
    indicators: [
      { content: "Berjalan di atas garis lurus tanpa kehilangan keseimbangan", themes: [THEME_A] },
      { content: "Menggunting mengikuti pola garis sederhana", themes: [THEME_A, THEME_B] },
    ],
  },
  {
    element: "ART",
    number: 1,
    competencyText:
      "Anak mengekspresikan imajinasi melalui karya dan gerak",
    content:
      "Anak mengekspresikan ide melalui kegiatan seni rupa, musik, dan gerak",
    indicators: [
      { content: "Menggambar bebas dan menceritakan hasil karyanya", themes: [THEME_A, THEME_B] },
      { content: "Menirukan gerak dan lagu sederhana bersama teman", themes: [THEME_B] },
    ],
  },
];

/**
 * Demo kisi-kisi. One narrative per (section × level) plus the 3 closing
 * sections — the 18 slots the authoring UI shows. Deliberately generic so the
 * same text reads sensibly for either age group; the real school writes
 * cohort-specific wording.
 */
const DEMO_SECTION_NARRATIVES: Record<string, Record<string, string>> = {
  INTRODUCTION: {
    CONSISTENT:
      "Alhamdulillah, ananda menjalani triwulan ini dengan antusias dan menunjukkan perkembangan yang menggembirakan di berbagai aspek.",
    EMERGING:
      "Alhamdulillah, ananda menjalani triwulan ini dengan ceria dan mulai menunjukkan perkembangan di berbagai aspek.",
    NEEDS_REINFORCEMENT:
      "Alhamdulillah, ananda hadir dengan ceria pada triwulan ini dan masih memerlukan pendampingan pada beberapa aspek.",
  },
  RELIGIOUS_MORAL: {
    CONSISTENT:
      "Ananda terbiasa mengucap kalimat thayyibah, menjalankan adab harian, dan mengenali ciptaan Allah di sekitarnya tanpa perlu diingatkan.",
    EMERGING:
      "Ananda mulai terbiasa mengucap kalimat thayyibah dan menjalankan adab harian, sesekali masih perlu diingatkan guru.",
    NEEDS_REINFORCEMENT:
      "Ananda masih memerlukan pendampingan untuk membiasakan kalimat thayyibah dan adab harian. Pembiasaan di rumah akan sangat membantu.",
  },
  IDENTITY: {
    CONSISTENT:
      "Ananda mengenali identitas dirinya dengan baik, mandiri dalam kegiatan harian, dan mampu menyampaikan keinginannya dengan santun.",
    EMERGING:
      "Ananda mulai mandiri dalam kegiatan harian dan sedang belajar menyampaikan keinginannya dengan kalimat yang lebih jelas.",
    NEEDS_REINFORCEMENT:
      "Ananda masih memerlukan bimbingan untuk mandiri dalam kegiatan harian dan menyampaikan keinginannya secara verbal.",
  },
  STEAM: {
    CONSISTENT:
      "Ananda menunjukkan rasa ingin tahu yang besar, aktif bereksplorasi, serta mengenal konsep bilangan dan bentuk melalui kegiatan bermain.",
    EMERGING:
      "Ananda mulai menunjukkan rasa ingin tahu dan sedang mengembangkan pemahaman konsep bilangan serta bentuk melalui bermain.",
    NEEDS_REINFORCEMENT:
      "Ananda memerlukan pendampingan lebih untuk mengenal konsep bilangan dan bentuk. Kegiatan bermain sambil berhitung di rumah dapat membantu.",
  },
  PERFORMANCE_SHOWCASE: {
    CONSISTENT:
      "Ananda bergerak dengan terkoordinasi, terampil menggunakan alat tulis dan gunting, serta percaya diri menampilkan karyanya.",
    EMERGING:
      "Ananda mulai terampil menggunakan alat tulis dan gunting, serta sedang tumbuh kepercayaan dirinya dalam menampilkan karya.",
    NEEDS_REINFORCEMENT:
      "Ananda masih berlatih mengoordinasikan gerak dan menggunakan alat tulis. Latihan motorik halus di rumah akan membantu.",
  },
};

const DEMO_CLOSING_NARRATIVES: Record<string, string> = {
  CLOSING:
    "Terima kasih atas kerja sama Ayah dan Bunda selama triwulan ini. Semoga Allah SWT senantiasa menjaga ananda dan memudahkan setiap langkah perkembangannya.",
  FOLLOW_UP_PLAN:
    "Pada triwulan berikutnya, ananda akan didampingi untuk memperkuat kemandirian, pembiasaan ibadah harian, dan keterampilan motorik halus.",
  HOME_ACTIVITIES:
    "Kegiatan yang disarankan di rumah: membaca buku cerita bersama, membiasakan doa harian, serta melibatkan ananda dalam pekerjaan rumah sederhana.",
};

const SUBTHEMES: Record<string, string[]> = {
  [THEME_A]: [`Tubuhku ${DEMO_SUFFIX}`, `Panca Indera ${DEMO_SUFFIX}`],
  [THEME_B]: [`Rumahku ${DEMO_SUFFIX}`, `Sekolahku ${DEMO_SUFFIX}`],
};

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function utcMidnight(ymdStr: string): Date {
  return new Date(`${ymdStr}T00:00:00Z`);
}

/** Monday of the week containing `date`, in UTC (Jakarta-day contract). */
function mondayOf(date: Date): Date {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const dow = d.getUTCDay(); // 0 Sun … 6 Sat
  const delta = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + delta);
  return d;
}

async function main(): Promise<void> {
  const commit = process.argv.includes("--commit");
  const dbUrl = process.env.DATABASE_URL ?? "";
  if (dbUrl.includes(PROD_DB_REF)) {
    console.error(
      "✗ DATABASE_URL points at PRODUCTION. This script seeds demo content and must never run there.",
    );
    process.exit(1);
  }
  console.log(
    `DB ref: ${dbUrl.match(/postgres\.([a-z0-9]+)/)?.[1] ?? "unknown"} · mode: ${commit ? "COMMIT" : "dry-run"}`,
  );

  const academicYear = await prisma.academicYear.findFirst({
    where: { tenantId: TENANT_ID, status: "ACTIVE" },
    select: { id: true, name: true },
  });
  if (!academicYear) {
    console.error(`✗ Tenant ${TENANT_ID} has no ACTIVE academic year.`);
    process.exit(1);
  }

  // Week brackets are built around today so `getCurrentWeek` resolves for
  // whoever opens the page. Start one week back so "last pekan" exists too.
  const today = new Date();
  const firstMonday = mondayOf(today);
  firstMonday.setUTCDate(firstMonday.getUTCDate() - 7);
  const weeks: Array<{ number: number; startDate: string; endDate: string }> = [];
  for (let i = 0; i < WEEK_COUNT; i++) {
    const start = new Date(firstMonday);
    start.setUTCDate(start.getUTCDate() + i * 7);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 4); // Friday
    weeks.push({ number: i + 1, startDate: ymd(start), endDate: ymd(end) });
  }
  const semesterStart = weeks[0].startDate;
  const semesterEnd = weeks[weeks.length - 1].endDate;

  console.log(
    `Academic year: ${academicYear.name}\n` +
      `Semester window: ${semesterStart} → ${semesterEnd} (${WEEK_COUNT} pekan)\n` +
      `Today (${ymd(today)}) falls in pekan ${weeks.find((w) => ymd(today) >= w.startDate && ymd(today) <= w.endDate)?.number ?? "—"}`,
  );

  if (!commit) {
    const indicatorCount = DEMO_OBJECTIVES.reduce(
      (n, o) => n + o.indicators.length,
      0,
    );
    const linkCount = DEMO_OBJECTIVES.reduce(
      (n, o) => n + o.indicators.reduce((m, i) => m + i.themes.length, 0),
      0,
    );
    console.log(
      `\nDry-run — would write, per age group A and B:\n` +
        `  2 tema, 4 sub-tema, ${WEEK_COUNT} pekan (shared)\n` +
        `  ${DEMO_OBJECTIVES.length} tujuan pembelajaran × 2 = ${DEMO_OBJECTIVES.length * 2}\n` +
        `  ${indicatorCount} indikator × 2 = ${indicatorCount * 2}\n` +
        `  ${linkCount} kaitan IKTP×Tema × 2 = ${linkCount * 2}\n` +
        `  1 triwulan (shared) + 18 kisi-kisi × 2 = 36\n` +
        `\nRe-run with --commit to write.`,
    );
    return;
  }

  const created = {
    semester: 0,
    themes: 0,
    subThemes: 0,
    weeks: 0,
    objectives: 0,
    indicators: 0,
    links: 0,
    terms: 0,
    narrativeTemplates: 0,
    closingTemplates: 0,
  };

  await prisma.$transaction(
    async (tx) => {
      // ── Semester ────────────────────────────────────────────────────
      // Number 2 so it cannot collide with the existing demo Semester 1.
      let semester = await tx.semester.findFirst({
        where: { tenantId: TENANT_ID, academicYearId: academicYear.id, number: 2 },
        select: { id: true },
      });
      if (semester) {
        await tx.semester.update({
          where: { id: semester.id },
          data: {
            startDate: utcMidnight(semesterStart),
            endDate: utcMidnight(semesterEnd),
            status: "ACTIVE",
          },
        });
      } else {
        semester = await tx.semester.create({
          data: {
            tenantId: TENANT_ID,
            academicYearId: academicYear.id,
            number: 2,
            startDate: utcMidnight(semesterStart),
            endDate: utcMidnight(semesterEnd),
            status: "ACTIVE",
          },
          select: { id: true },
        });
        created.semester++;
      }

      // ── Theme / SubTheme / Week ─────────────────────────────────────
      const themeIdByName = new Map<string, string>();
      const themeNames = [THEME_A, THEME_B];
      let weekCursor = 0;
      for (const [themeIndex, themeName] of themeNames.entries()) {
        let theme = await tx.theme.findFirst({
          where: { tenantId: TENANT_ID, semesterId: semester.id, name: themeName },
          select: { id: true },
        });
        if (!theme) {
          theme = await tx.theme.create({
            data: {
              tenantId: TENANT_ID,
              semesterId: semester.id,
              name: themeName,
              order: themeIndex + 1,
            },
            select: { id: true },
          });
          created.themes++;
        }
        themeIdByName.set(themeName, theme.id);

        for (const [subIndex, subName] of SUBTHEMES[themeName].entries()) {
          let sub = await tx.subTheme.findFirst({
            where: { tenantId: TENANT_ID, themeId: theme.id, name: subName },
            select: { id: true },
          });
          if (!sub) {
            sub = await tx.subTheme.create({
              data: {
                tenantId: TENANT_ID,
                themeId: theme.id,
                name: subName,
                order: subIndex + 1,
              },
              select: { id: true },
            });
            created.subThemes++;
          }
          // Two weeks per sub-theme → 4 sub-themes × 2 = 8 weeks.
          for (let k = 0; k < WEEK_COUNT / 4; k++) {
            const w = weeks[weekCursor++];
            if (!w) break;
            const existingWeek = await tx.week.findFirst({
              where: { tenantId: TENANT_ID, subThemeId: sub.id, number: w.number },
              select: { id: true },
            });
            if (existingWeek) {
              await tx.week.update({
                where: { id: existingWeek.id },
                data: {
                  startDate: utcMidnight(w.startDate),
                  endDate: utcMidnight(w.endDate),
                  status: "ACTIVE",
                },
              });
              continue;
            }
            await tx.week.create({
              data: {
                tenantId: TENANT_ID,
                subThemeId: sub.id,
                number: w.number,
                startDate: utcMidnight(w.startDate),
                endDate: utcMidnight(w.endDate),
              },
            });
            created.weeks++;
          }
        }
      }

      // ── Objectives + indicators + theme links, per age group ────────
      for (const ageGroup of ["A", "B"] as const) {
        for (const demo of DEMO_OBJECTIVES) {
          let objective = await tx.learningObjective.findFirst({
            where: {
              tenantId: TENANT_ID,
              semesterId: semester.id,
              ageGroup,
              element: demo.element,
              number: demo.number,
            },
            select: { id: true },
          });
          if (!objective) {
            objective = await tx.learningObjective.create({
              data: {
                tenantId: TENANT_ID,
                semesterId: semester.id,
                ageGroup,
                element: demo.element,
                number: demo.number,
                competencyText: demo.competencyText,
                content: `${demo.content} ${DEMO_SUFFIX}`,
              },
              select: { id: true },
            });
            created.objectives++;
          }

          for (const [order0, ind] of demo.indicators.entries()) {
            const order = order0 + 1;
            let indicator = await tx.achievementIndicator.findFirst({
              where: {
                tenantId: TENANT_ID,
                objectiveId: objective.id,
                order,
              },
              select: { id: true },
            });
            if (!indicator) {
              indicator = await tx.achievementIndicator.create({
                data: {
                  tenantId: TENANT_ID,
                  objectiveId: objective.id,
                  content: ind.content,
                  order,
                },
                select: { id: true },
              });
              created.indicators++;
            }

            const linkData = ind.themes
              .map((name) => themeIdByName.get(name))
              .filter((id): id is string => Boolean(id))
              .map((themeId) => ({ indicatorId: indicator!.id, themeId }));
            if (linkData.length > 0) {
              const res = await tx.indicatorThemeLink.createMany({
                data: linkData,
                skipDuplicates: true,
              });
              created.links += res.count;
            }
          }
        }
      }
      // ── Triwulan + kisi-kisi ──────────────────────────────────────
      // Without a Term the whole raport chain is unreachable: no roster, no
      // auto-draft, nowhere to hang the kisi-kisi. Window matches the demo
      // semester so the attendance + penilaian aggregation has data to find.
      let term = await tx.term.findFirst({
        where: { tenantId: TENANT_ID, semesterId: semester.id, number: 1, deletedAt: null },
        select: { id: true },
      });
      if (!term) {
        term = await tx.term.create({
          data: {
            tenantId: TENANT_ID,
            semesterId: semester.id,
            number: 1,
            startDate: utcMidnight(semesterStart),
            endDate: utcMidnight(semesterEnd),
          },
          select: { id: true },
        });
        created.terms++;
      }

      for (const ageGroup of ["A", "B"] as const) {
        for (const [section, byLevel] of Object.entries(DEMO_SECTION_NARRATIVES)) {
          for (const [level, content] of Object.entries(byLevel)) {
            const existing = await tx.reportNarrativeTemplate.findUnique({
              where: {
                tenantId_termId_ageGroup_section_level: {
                  tenantId: TENANT_ID,
                  termId: term.id,
                  ageGroup,
                  section: section as never,
                  level: level as never,
                },
              },
              select: { id: true },
            });
            if (existing) continue;
            await tx.reportNarrativeTemplate.create({
              data: {
                tenantId: TENANT_ID,
                termId: term.id,
                ageGroup,
                section: section as never,
                level: level as never,
                content: `${content} ${DEMO_SUFFIX}`,
              },
            });
            created.narrativeTemplates++;
          }
        }
        for (const [section, content] of Object.entries(DEMO_CLOSING_NARRATIVES)) {
          const existing = await tx.reportClosingTemplate.findUnique({
            where: {
              tenantId_termId_ageGroup_section: {
                tenantId: TENANT_ID,
                termId: term.id,
                ageGroup,
                section: section as never,
              },
            },
            select: { id: true },
          });
          if (existing) continue;
          await tx.reportClosingTemplate.create({
            data: {
              tenantId: TENANT_ID,
              termId: term.id,
              ageGroup,
              section: section as never,
              content: `${content} ${DEMO_SUFFIX}`,
            },
          });
          created.closingTemplates++;
        }
      }
    },
    { timeout: 120_000 },
  );

  console.log(
    `\n✓ Demo curriculum seeded:\n` +
      `  semester dibuat : ${created.semester}\n` +
      `  tema            : ${created.themes}\n` +
      `  sub-tema        : ${created.subThemes}\n` +
      `  pekan           : ${created.weeks}\n` +
      `  tujuan          : ${created.objectives}\n` +
      `  indikator       : ${created.indicators}\n` +
      `  kaitan tema     : ${created.links}\n` +
      `  triwulan        : ${created.terms}\n` +
      `  kisi-kisi narasi: ${created.narrativeTemplates}\n` +
      `  kisi-kisi penutup: ${created.closingTemplates}\n` +
      `\nZero counts on a re-run mean the rows already existed (idempotent).`,
  );
}

main()
  .catch((err) => {
    console.error("✗ Gagal:", err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
