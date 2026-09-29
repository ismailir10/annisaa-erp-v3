// Synthetic curriculum content for prisma/seed.ts: themes + sub-themes per
// semester, learning objectives (TP) with achievement indicators (IKTP), and
// the raport narrative bank. Fabricated demo text — not a real PROMES.
//
// Shapes mirror the Prisma models so the seed can `createMany` them directly.

export type CurriculumElementCode =
  | "RELIGIOUS_MORAL"
  | "IDENTITY"
  | "STEAM"
  | "MOTOR_SKILLS"
  | "ART";

export type ThemePlan = { name: string; subThemes: [string, string] };

/** Six themes per semester, two sub-themes each. Semester 1 (Ganjil). */
export const THEMES_SEMESTER_1: ThemePlan[] = [
  { name: "Saya Anak Sehat", subThemes: ["Tubuhku", "Makanan Sehat"] },
  { name: "Lingkunganku", subThemes: ["Rumahku", "Sekolahku"] },
  { name: "Aku Berakhlak", subThemes: ["Adab Sehari-hari", "Berbagi dengan Teman"] },
  { name: "Senang Berkarya", subThemes: ["Warna dan Bentuk", "Kreasi dari Bahan Alam"] },
  { name: "Alam Sekitar", subThemes: ["Tumbuhan di Sekitarku", "Hewan Peliharaan"] },
  { name: "Aku Cinta Indonesia", subThemes: ["Bendera dan Lagu Kebangsaan", "Rumah Adat"] },
];

/** Semester 2 (Genap). */
export const THEMES_SEMESTER_2: ThemePlan[] = [
  { name: "Binatang di Sekitarku", subThemes: ["Binatang Darat", "Binatang Air"] },
  { name: "Kendaraan", subThemes: ["Kendaraan Darat", "Kendaraan Udara dan Air"] },
  { name: "Pekerjaan", subThemes: ["Pekerjaan di Sekitarku", "Cita-citaku"] },
  { name: "Air, Udara, dan Cuaca", subThemes: ["Air Bersih", "Cuaca dan Musim"] },
  { name: "Bulan Ramadhan dan Hari Raya", subThemes: ["Puasa dan Berbagi", "Hari Raya"] },
  { name: "Selamat Tinggal Sekolah", subThemes: ["Kenangan Bersama", "Aku Siap Naik Kelas"] },
];

export const CURRICULUM_ELEMENTS: CurriculumElementCode[] = [
  "RELIGIOUS_MORAL",
  "IDENTITY",
  "STEAM",
  "MOTOR_SKILLS",
  "ART",
];

type ObjectivePlan = { competencyText: string; content: string; indicators: [string, string] };

/** Two TP per element, two IKTP per TP. Reused for TK A and TK B. */
export const OBJECTIVES: Record<CurriculumElementCode, [ObjectivePlan, ObjectivePlan]> = {
  RELIGIOUS_MORAL: [
    {
      competencyText: "Anak mengenal dan menjalankan ibadah harian sesuai tuntunan agama.",
      content: "Anak terbiasa berwudhu, berdoa, dan melaksanakan gerakan sholat dengan tertib.",
      indicators: ["Menirukan urutan gerakan wudhu dengan benar", "Melafalkan doa sebelum dan sesudah makan"],
    },
    {
      competencyText: "Anak menunjukkan perilaku santun dan berakhlak mulia.",
      content: "Anak terbiasa mengucapkan salam, terima kasih, dan maaf dalam keseharian.",
      indicators: ["Mengucapkan salam saat bertemu guru dan teman", "Mengucapkan terima kasih dan maaf tanpa diingatkan"],
    },
  ],
  IDENTITY: [
    {
      competencyText: "Anak mengenal dirinya, keluarga, dan lingkungan terdekatnya.",
      content: "Anak mampu menyebutkan identitas diri dan anggota keluarganya.",
      indicators: ["Menyebutkan nama lengkap dan usia sendiri", "Menyebutkan anggota keluarga inti"],
    },
    {
      competencyText: "Anak mengelola emosi dan berinteraksi positif dengan teman.",
      content: "Anak mampu mengungkapkan perasaan dan bermain bersama tanpa bertengkar.",
      indicators: ["Mengungkapkan perasaan dengan kata-kata", "Bergantian menggunakan mainan bersama teman"],
    },
  ],
  STEAM: [
    {
      competencyText: "Anak mengenal konsep bilangan dan pola melalui kegiatan bermain.",
      content: "Anak mampu menghitung, membandingkan, dan mengurutkan benda konkret.",
      indicators: ["Menghitung benda sampai 10 dengan urut", "Mengelompokkan benda berdasarkan warna atau bentuk"],
    },
    {
      competencyText: "Anak mengenal huruf dan menyampaikan gagasan secara lisan.",
      content: "Anak mampu mengenali huruf awal namanya dan menceritakan pengalamannya.",
      indicators: ["Menyebutkan huruf awal nama sendiri", "Menceritakan kegiatan yang dialami dalam 2-3 kalimat"],
    },
  ],
  MOTOR_SKILLS: [
    {
      competencyText: "Anak mengembangkan motorik kasar melalui aktivitas fisik.",
      content: "Anak mampu berlari, melompat, dan menjaga keseimbangan tubuh.",
      indicators: ["Melompat dengan dua kaki secara bergantian", "Berjalan di atas garis lurus tanpa jatuh"],
    },
    {
      competencyText: "Anak mengembangkan motorik halus melalui kegiatan mencoret dan menempel.",
      content: "Anak mampu menggunakan gunting, pensil, dan lem dengan terkendali.",
      indicators: ["Menggunting mengikuti garis lurus", "Memegang pensil dengan tiga jari"],
    },
  ],
  ART: [
    {
      competencyText: "Anak mengekspresikan diri melalui karya seni rupa.",
      content: "Anak mampu membuat gambar dan kolase dari beragam bahan.",
      indicators: ["Menggambar bebas dengan menyebutkan isi gambarnya", "Membuat kolase dari bahan alam"],
    },
    {
      competencyText: "Anak mengekspresikan diri melalui musik dan gerak.",
      content: "Anak mampu bernyanyi dan bergerak mengikuti irama.",
      indicators: ["Menyanyikan lagu anak dengan lafal jelas", "Menari mengikuti irama sederhana"],
    },
  ],
};

export const ACTIVITY_BY_CENTER: Record<string, string> = {
  WORSHIP: "Praktik wudhu dan gerakan sholat bersama",
  BLOCKS: "Membangun rumah dari balok susun",
  ART: "Membuat kolase dari daun dan kertas warna",
};

// ── Raport (triwulan) narrative bank ────────────────────────────────────────

export const BUCKETED_SECTIONS = [
  "INTRODUCTION",
  "RELIGIOUS_MORAL",
  "IDENTITY",
  "STEAM",
  "PERFORMANCE_SHOWCASE",
] as const;
export const CLOSING_SECTIONS = ["CLOSING", "FOLLOW_UP_PLAN", "HOME_ACTIVITIES"] as const;
export type Level = "CONSISTENT" | "EMERGING" | "NEEDS_REINFORCEMENT";

const SECTION_TOPIC: Record<(typeof BUCKETED_SECTIONS)[number], string> = {
  INTRODUCTION: "perkembangan secara umum",
  RELIGIOUS_MORAL: "nilai agama dan budi pekerti",
  IDENTITY: "jati diri",
  STEAM: "dasar literasi dan STEAM",
  PERFORMANCE_SHOWCASE: "unjuk kerja motorik dan seni",
};

const LEVEL_PHRASE: Record<Level, string> = {
  CONSISTENT: "sudah konsisten dan menunjukkan perkembangan yang sangat baik",
  EMERGING: "sedang berkembang dan mulai tampak konsisten dengan pendampingan",
  NEEDS_REINFORCEMENT: "masih memerlukan penguatan melalui pengulangan kegiatan",
};

export function narrativeFor(section: (typeof BUCKETED_SECTIONS)[number], level: Level): string {
  return `Pada aspek ${SECTION_TOPIC[section]}, ananda ${LEVEL_PHRASE[level]}.`;
}

export const CLOSING_TEXT: Record<(typeof CLOSING_SECTIONS)[number], string> = {
  CLOSING: "Alhamdulillah, ananda menjalani triwulan ini dengan semangat. Terima kasih atas kerja sama Ayah dan Bunda.",
  FOLLOW_UP_PLAN: "Guru akan melanjutkan stimulasi pada aspek yang masih berkembang melalui kegiatan sentra dan pekanan.",
  HOME_ACTIVITIES: "Ajak ananda mengulang doa harian, bercerita sebelum tidur, dan bermain menyusun balok di rumah.",
};

/** Level-bearing sections (INTRODUCTION carries a narrative but no level). */
export type LeveledSection = Exclude<(typeof BUCKETED_SECTIONS)[number], "INTRODUCTION">;

/** Raport section keys → level for the demo cards. */
export const DEMO_LEVELS: Record<"published" | "draft", Record<LeveledSection, Level>> = {
  published: {
    RELIGIOUS_MORAL: "CONSISTENT",
    IDENTITY: "CONSISTENT",
    STEAM: "EMERGING",
    PERFORMANCE_SHOWCASE: "CONSISTENT",
  },
  draft: {
    RELIGIOUS_MORAL: "EMERGING",
    IDENTITY: "EMERGING",
    STEAM: "NEEDS_REINFORCEMENT",
    PERFORMANCE_SHOWCASE: "EMERGING",
  },
};
