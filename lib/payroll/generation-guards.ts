/**
 * Pre-flight rules for payroll generation and approval (HR-12).
 *
 * Pure helpers so the route handlers and their tests share one definition.
 */

/** A period that has not started yet has no attendance to pay against. */
export function isFuturePayrollPeriod(periodStart: string, todayYmd: string): boolean {
  return periodStart > todayYmd;
}

export type NegativeNetEmployee = { id: string; kode?: string; nama?: string; netAmount: number };

/** Employees whose net pay would come out below zero (deductions > income). */
export function findNegativeNet<T extends { netAmount: number }>(rows: T[]): T[] {
  return rows.filter((r) => Number.isFinite(r.netAmount) && r.netAmount < 0);
}
