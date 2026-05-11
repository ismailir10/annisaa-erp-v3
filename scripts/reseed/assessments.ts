import type { PrismaClient } from "../../lib/generated/prisma/client";
import { createRng } from "./rng";
import type { SeedOrgResult } from "./org";
import type { SeedPeopleResult, StudentPlan } from "./people";
import { OWNER_EMAIL } from "./users";

// PAUD curriculum: 6 categories × 4 indicators = 24 indicators per template.
export const ASSESSMENT_CATEGORIES: Array<{
  name: string;
  indicators: string[];
}> = [
  {
    name: "Nilai Agama dan Moral",
    indicators: [
      "Mengenal Tuhan melalui agamanya",
      "Mengikuti doa-doa harian dengan benar",
      "Membedakan perilaku baik dan buruk",
      "Menghormati orang tua dan guru",
    ],
  },
  {
    name: "Fisik Motorik",
    indicators: [
      "Melakukan gerakan motorik kasar (lari, lompat)",
      "Menggunting mengikuti pola sederhana",
      "Memegang pensil dengan benar",
      "Menjaga kebersihan diri",
    ],
  },
  {
    name: "Kognitif",
    indicators: [
      "Mengenal angka 1-20",
      "Menyusun puzzle sederhana",
      "Mengelompokkan benda berdasarkan warna/bentuk",
      "Mengenal konsep sebab akibat",
    ],
  },
  {
    name: "Bahasa",
    indicators: [
      "Mengenal huruf hijaiyah",
      "Membaca kosakata sederhana",
      "Menyebutkan kata sapaan dan terima kasih",
      "Bercerita pengalaman sederhana",
    ],
  },
  {
    name: "Sosial Emosional",
    indicators: [
      "Berbagi mainan dengan teman",
      "Menyatakan emosi dengan kata yang tepat",
      "Mengikuti aturan sederhana",
      "Bekerja sama dalam kelompok",
    ],
  },
  {
    name: "Seni",
    indicators: [
      "Menggambar bebas dengan crayon",
      "Menyanyikan lagu islami",
      "Membuat kreasi dari plastisin",
      "Mengikuti gerakan tari sederhana",
    ],
  },
];

// Score distribution roughly: BB 5% / MB 15% / BSH 65% / BSB 15%.
function pickScore(rng: ReturnType<typeof createRng>): "BB" | "MB" | "BSH" | "BSB" {
  const r = rng.next();
  if (r < 0.05) return "BB";
  if (r < 0.20) return "MB";
  if (r < 0.85) return "BSH";
  return "BSB";
}

export type SeedAssessmentsResult = {
  templates: number;
  categories: number;
  indicators: number;
  studentAssessments: number;
  scores: number;
};

type ProgramCode = "DCARE" | "KB" | "TKIT-A" | "TKIT-B";

export async function seedAssessments(
  prisma: PrismaClient,
  org: SeedOrgResult,
  people: SeedPeopleResult,
  studentPlan: StudentPlan[],
  opts: { seed?: number } = {},
): Promise<SeedAssessmentsResult> {
  const rng = createRng(opts.seed ?? 312);
  const recordedBy = people.userIdByPreservedEmail[OWNER_EMAIL];
  if (!recordedBy) {
    throw new Error(
      `seedAssessments: missing SUPER_ADMIN preserved User (${OWNER_EMAIL})`,
    );
  }

  // ── Build one template per program with 6 categories × 4 indicators.
  const programs: ProgramCode[] = ["DCARE", "KB", "TKIT-A", "TKIT-B"];

  // indicatorIdsByProgram → array of 24 indicator IDs in template insertion order.
  const indicatorIdsByProgram: Record<ProgramCode, string[]> = {
    DCARE: [],
    KB: [],
    "TKIT-A": [],
    "TKIT-B": [],
  };
  // templateIdByProgram for StudentAssessment FK.
  const templateIdByProgram: Record<ProgramCode, string> = {
    DCARE: "",
    KB: "",
    "TKIT-A": "",
    "TKIT-B": "",
  };

  let categoriesCount = 0;
  let indicatorsCount = 0;

  for (const programCode of programs) {
    const tpl = await prisma.assessmentTemplate.create({
      data: {
        tenantId: org.tenantId,
        programId: org.programIdByCode[programCode],
        name: "Laporan Perkembangan Semester",
        type: "SEMESTER",
        isActive: true,
      },
    });
    templateIdByProgram[programCode] = tpl.id;

    for (let ci = 0; ci < ASSESSMENT_CATEGORIES.length; ci++) {
      const cat = ASSESSMENT_CATEGORIES[ci];
      const catRow = await prisma.assessmentCategory.create({
        data: { templateId: tpl.id, name: cat.name, sortOrder: ci },
      });
      categoriesCount++;
      const indicatorRows = await Promise.all(
        cat.indicators.map((desc, ii) =>
          prisma.assessmentIndicator.create({
            data: { categoryId: catRow.id, description: desc, sortOrder: ii },
          }),
        ),
      );
      indicatorsCount += indicatorRows.length;
      for (const r of indicatorRows) {
        indicatorIdsByProgram[programCode].push(r.id);
      }
    }
  }

  // ── StudentAssessment + StudentAssessmentScore.
  type AssessmentSpec = {
    studentId: string;
    templateId: string;
    period: string;
    status: "DRAFT" | "PUBLISHED";
    indicatorIds: string[];
  };
  const specs: AssessmentSpec[] = [];

  for (const s of studentPlan.filter((x) => x.status === "ACTIVE")) {
    const template = templateIdByProgram[s.programCode];
    const indicatorIds = indicatorIdsByProgram[s.programCode];
    specs.push({
      studentId: people.studentIdByIndex[s.index],
      templateId: template,
      period: "Semester 1 2025/2026",
      status: "PUBLISHED",
      indicatorIds,
    });
    specs.push({
      studentId: people.studentIdByIndex[s.index],
      templateId: template,
      period: "Semester 2 2025/2026",
      status: "DRAFT",
      indicatorIds,
    });
  }

  for (const s of studentPlan.filter((x) => x.status === "GRADUATED")) {
    const template = templateIdByProgram["TKIT-B"];
    const indicatorIds = indicatorIdsByProgram["TKIT-B"];
    for (const period of ["Semester 1 2024/2025", "Semester 2 2024/2025"]) {
      specs.push({
        studentId: people.studentIdByIndex[s.index],
        templateId: template,
        period,
        status: "PUBLISHED",
        indicatorIds,
      });
    }
  }

  // Create assessments + capture ids → batch scores.
  let assessmentCount = 0;
  let scoreCount = 0;
  const allScoreRows: Array<{
    assessmentId: string;
    indicatorId: string;
    score: string;
  }> = [];

  // Chunk size matches the Prisma pg-adapter default pool (10) so concurrent
  // creates don't queue past the connection-acquire timeout.
  const chunkSize = 10;
  for (let i = 0; i < specs.length; i += chunkSize) {
    const chunk = specs.slice(i, i + chunkSize);
    const created = await Promise.all(
      chunk.map((sp) =>
        prisma.studentAssessment.create({
          data: {
            studentId: sp.studentId,
            templateId: sp.templateId,
            period: sp.period,
            status: sp.status,
            createdBy: recordedBy,
            publishedAt: sp.status === "PUBLISHED" ? new Date() : null,
          },
        }),
      ),
    );
    assessmentCount += created.length;
    for (let j = 0; j < created.length; j++) {
      const a = created[j];
      const sp = chunk[j];
      for (const indId of sp.indicatorIds) {
        allScoreRows.push({
          assessmentId: a.id,
          indicatorId: indId,
          score: pickScore(rng),
        });
      }
    }
  }

  // Bulk insert scores.
  for (let i = 0; i < allScoreRows.length; i += 1000) {
    const batch = allScoreRows.slice(i, i + 1000);
    const r = await prisma.studentAssessmentScore.createMany({
      data: batch,
      skipDuplicates: true,
    });
    scoreCount += r.count;
  }

  return {
    templates: programs.length,
    categories: categoriesCount,
    indicators: indicatorsCount,
    studentAssessments: assessmentCount,
    scores: scoreCount,
  };
}
