/**
 * Format number as Indonesian Rupiah.
 * Single source of truth — use this everywhere instead of inline formatters.
 */
export function formatRupiah(amount: number | string): string {
  return "Rp " + Math.round(Number(amount)).toLocaleString("id-ID");
}

/**
 * Mask a bank account number, revealing only the last 4 digits.
 * Use everywhere a bank account is rendered to the employee — slip detail,
 * profile page, payroll receipt, PDF. Single source of truth.
 *
 * - "1234567890" → "******7890"
 * - "1234"       → "****"     (≤ 4 chars: full mask — never reveal a short
 *                              value; real Indonesian accounts are 10–16
 *                              digits so this branch is unreachable in
 *                              normal data, but the function is a security
 *                              primitive and must fail closed)
 * - ""           → ""         (caller decides empty-state copy)
 */
export function maskBankAccount(accountNo: string): string {
  if (accountNo.length === 0) return accountNo;
  if (accountNo.length <= 4) return "*".repeat(accountNo.length);
  const visible = accountNo.slice(-4);
  const masked = "*".repeat(accountNo.length - 4);
  return `${masked}${visible}`;
}

/**
 * Format date string (YYYY-MM-DD) to Indonesian locale.
 */
export function formatDate(dateStr: string, options?: Intl.DateTimeFormatOptions): string {
  const defaults: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "long",
    year: "numeric",
  };
  // Handle both YYYY-MM-DD and ISO datetime (2026-04-10T14:30:45.123Z)
  const dateOnly = dateStr.includes("T") ? dateStr.split("T")[0] : dateStr;
  return new Date(dateOnly + "T00:00:00").toLocaleDateString("id-ID", options ?? defaults);
}

/**
 * Format date string to short format (e.g., "8 Apr 2026")
 */
export function formatDateShort(dateStr: string): string {
  // Handle both YYYY-MM-DD and ISO datetime (2026-04-10T14:30:45.123Z)
  const dateOnly = dateStr.includes("T") ? dateStr.split("T")[0] : dateStr;
  return new Date(dateOnly + "T00:00:00").toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Format month + year as "Januari 2026" (Indonesian).
 */
export function formatMonthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" });
}

/**
 * Format an ISO timestamp as a relative-time phrase in Indonesian
 * (e.g. "baru saja", "5 menit lalu", "2 jam lalu", "3 hari lalu").
 * Falls back to absolute short date for ages > 30 days.
 */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const diffMs = now.getTime() - then.getTime();
  if (Number.isNaN(diffMs)) return "";
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 45) return "baru saja";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} menit lalu`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour} jam lalu`;
  const diffDay = Math.round(diffHour / 24);
  if (diffDay < 30) return `${diffDay} hari lalu`;
  return formatDateShort(then.toISOString());
}

/**
 * Format time from ISO datetime string.
 */
export function formatTime(iso: string | null): string {
  if (!iso) return "--:--";
  return new Date(iso).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
