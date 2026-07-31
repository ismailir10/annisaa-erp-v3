// Indonesia National Holidays + Cuti Bersama
// Sources: ForPublic.id, timeanddate.com, SKB 3 Menteri 2025
//
// ⚠ This file is organised by CALENDAR year; the school runs on ACADEMIC
// years (July → June). Academic year 2026/2027 therefore spans two blocks
// here: Jul–Dec 2026 (below) and Jan–Jun 2027 (`holidays2027`).
//
// `scripts/verify-curriculum-readiness.ts` fails its "Kalender libur"
// check when the second half of an academic year has no holiday rows,
// because an empty second semester silently inflates the raport's
// `totalSchoolDays` denominator.
export const holidays = [
  // January
  { date: "2026-01-01", name: "Tahun Baru 2026 Masehi", type: "NATIONAL" },
  { date: "2026-01-16", name: "Isra Mi'raj Nabi Muhammad SAW", type: "ISLAMIC" },

  // February
  { date: "2026-02-16", name: "Cuti Bersama Imlek", type: "NATIONAL" },
  { date: "2026-02-17", name: "Tahun Baru Imlek 2577", type: "NATIONAL" },

  // March — Nyepi + Idul Fitri
  { date: "2026-03-18", name: "Cuti Bersama Idul Fitri", type: "ISLAMIC" },
  { date: "2026-03-19", name: "Hari Suci Nyepi Tahun Baru Saka 1948", type: "NATIONAL" },
  { date: "2026-03-20", name: "Cuti Bersama Idul Fitri", type: "ISLAMIC" },
  { date: "2026-03-21", name: "Hari Raya Idul Fitri 1447 Hijriah", type: "ISLAMIC" },
  { date: "2026-03-22", name: "Hari Raya Idul Fitri 1447 Hijriah", type: "ISLAMIC" },
  { date: "2026-03-23", name: "Cuti Bersama Idul Fitri", type: "ISLAMIC" },
  { date: "2026-03-24", name: "Cuti Bersama Idul Fitri", type: "ISLAMIC" },

  // April
  { date: "2026-04-03", name: "Wafat Isa Al Masih (Jumat Agung)", type: "NATIONAL" },

  // May
  { date: "2026-05-01", name: "Hari Buruh Internasional", type: "NATIONAL" },
  { date: "2026-05-14", name: "Kenaikan Isa Al Masih", type: "NATIONAL" },
  { date: "2026-05-15", name: "Cuti Bersama Kenaikan Isa Al Masih", type: "NATIONAL" },
  { date: "2026-05-27", name: "Hari Raya Idul Adha 1447 Hijriah", type: "ISLAMIC" },
  { date: "2026-05-31", name: "Hari Raya Waisak 2570 BE", type: "NATIONAL" },

  // June
  { date: "2026-06-01", name: "Hari Lahir Pancasila", type: "NATIONAL" },
  { date: "2026-06-17", name: "Tahun Baru Islam 1448 Hijriah", type: "ISLAMIC" },

  // August
  { date: "2026-08-17", name: "Hari Kemerdekaan Republik Indonesia", type: "NATIONAL" },
  { date: "2026-08-26", name: "Maulid Nabi Muhammad SAW", type: "ISLAMIC" },

  // December
  { date: "2026-12-24", name: "Cuti Bersama Natal", type: "NATIONAL" },
  { date: "2026-12-25", name: "Hari Raya Natal", type: "NATIONAL" },
];

/**
 * Jan–Jun 2027 — second semester of academic year 2026/2027.
 *
 * TODO(owner-input): populate from SKB 3 Menteri 2027 once the decree is
 * published / supplied by the school. Deliberately left empty rather than
 * estimated: Idul Fitri, Nyepi, Waisak and every cuti bersama move year to
 * year, and a wrong date here silently mis-counts school days on every
 * raport for the term.
 *
 * Shape matches `holidays` above; append to that array's consumers by
 * spreading `allHolidays` rather than importing this one directly.
 */
export const holidays2027: typeof holidays = [];

/**
 * Every known holiday across both calendar years. Prefer this over
 * `holidays` in anything that reasons about an academic-year window.
 */
export const allHolidays = [...holidays, ...holidays2027];
