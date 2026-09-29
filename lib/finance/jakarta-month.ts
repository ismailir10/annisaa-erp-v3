import { getYmdInTimezone } from "@/lib/attendance/timezone";

const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000; // WIB = UTC+7, no DST

/**
 * [start, end) of the Jakarta calendar month containing `now`, as the UTC
 * instants Prisma compares a timestamptz column against. Same convention as
 * `getPaymentsLedger` (payments-ledger.ts): `paidAt` is the economic date.
 */
export function jakartaMonthRangeUtc(now: Date = new Date()): { start: Date; end: Date } {
  const [y, m] = getYmdInTimezone(now, "Asia/Jakarta").split("-").map(Number);
  return {
    start: new Date(Date.UTC(y, m - 1, 1) - JAKARTA_OFFSET_MS),
    end: new Date(Date.UTC(y, m, 1) - JAKARTA_OFFSET_MS),
  };
}
