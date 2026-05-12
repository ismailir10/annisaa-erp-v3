export const INCOME_RANGES = {
  LT_1M:   "< Rp 1 Juta",
  R_1_3M:  "Rp 1 - 3 Juta",
  R_3_5M:  "Rp 3 - 5 Juta",
  R_5_10M: "Rp 5 - 10 Juta",
  GT_10M:  "> Rp 10 Juta",
} as const;

export type IncomeRangeKey = keyof typeof INCOME_RANGES;

export function isIncomeRangeKey(value: unknown): value is IncomeRangeKey {
  return typeof value === "string" && value in INCOME_RANGES;
}

export function formatIncomeRange(key: unknown): string | null {
  if (!isIncomeRangeKey(key)) return null;
  return INCOME_RANGES[key];
}
