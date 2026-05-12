import { type IncomeRangeKey } from "@/lib/constants/income";

const MAP: Array<[RegExp, IncomeRangeKey]> = [
  // LT_1M: < 1 juta / < 1jt / < 1.000.000
  [/^<\s*(rp\.?\s*)?1\s*(juta|jt|\.?000[\.\s]?000)/i,                               "LT_1M"],
  // R_1_3M: 1-3 juta / 1.000.000 s/d 3.000.000 / 1-3jt / rp 1 - 3 juta
  [/^(rp\.?\s*)?1[\s\.\-]+3\s*(juta|jt)|1[\.\s]?000[\.\s]?000\s*s\/d\s*(rp\.?\s*)?3/i, "R_1_3M"],
  // R_3_5M: 3-5 juta / Rp. 3.000.000 s/d Rp. 5.000.000
  [/^(rp\.?\s*)?3[\s\.\-]+5\s*(juta|jt)|3[\.\s]?000[\.\s]?000\s*s\/d\s*(rp\.?\s*)?5/i, "R_3_5M"],
  // R_5_10M: 5-10 juta / Rp. 5.000.000 s/d Rp. 10.000.000
  [/^(rp\.?\s*)?5[\s\.\-]+10\s*(juta|jt)|5[\.\s]?000[\.\s]?000\s*s\/d\s*(rp\.?\s*)?10/i, "R_5_10M"],
  // GT_10M: > 10 juta / > 10.000.000 / > Rp. 10.000.000
  [/^>\s*(rp\.?\s*)?10\s*(juta|jt|\.?000[\.\s]?000)/i,                               "GT_10M"],
];

export function mapIncomeFreeText(input: unknown): IncomeRangeKey | null {
  if (typeof input !== "string") return null;
  const cleaned = input.trim();
  if (!cleaned) return null;
  for (const [re, key] of MAP) {
    if (re.test(cleaned)) return key;
  }
  return null;
}

// CLI entry-point — runs the mapping over Parent.incomeRange and
// Admission.parentIncome rows, writes results back, logs unmapped IDs.
export async function run(): Promise<void> {
  const { prisma } = await import("@/lib/db");

  const parents = await prisma.parent.findMany({
    where: { incomeRange: { not: null } },
    select: { id: true, tenantId: true, incomeRange: true },
  });

  let mapped = 0;
  let unmapped = 0;
  for (const p of parents) {
    const key = mapIncomeFreeText(p.incomeRange);
    if (!key) {
      unmapped++;
      // eslint-disable-next-line no-console
      console.warn(`[canonicalize-income] unmapped Parent ${p.id}: ${p.incomeRange}`);
      continue;
    }
    if (key !== p.incomeRange) {
      await prisma.parent.update({ where: { id: p.id }, data: { incomeRange: key } });
      mapped++;
    }
  }

  const admissions = await prisma.admission.findMany({
    where: { parentIncome: { not: null } },
    select: { id: true, tenantId: true, parentIncome: true },
  });
  for (const a of admissions) {
    const key = mapIncomeFreeText(a.parentIncome);
    if (!key) {
      unmapped++;
      // eslint-disable-next-line no-console
      console.warn(`[canonicalize-income] unmapped Admission ${a.id}: ${a.parentIncome}`);
      continue;
    }
    if (key !== a.parentIncome) {
      await prisma.admission.update({ where: { id: a.id }, data: { parentIncome: key } });
      mapped++;
    }
  }

  // eslint-disable-next-line no-console
  console.log(`[canonicalize-income] mapped=${mapped} unmapped=${unmapped}`);
}

if (require.main === module) {
  run()
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error(err);
      process.exit(1);
    });
}
