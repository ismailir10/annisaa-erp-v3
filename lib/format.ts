/**
 * Format number as Indonesian Rupiah.
 * Single source of truth — use this everywhere instead of inline formatters.
 */
export function formatRupiah(amount: number | string): string {
  return "Rp " + Math.round(Number(amount)).toLocaleString("id-ID");
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
