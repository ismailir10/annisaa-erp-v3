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
  return new Date(dateStr + "T00:00:00").toLocaleDateString("id-ID", options ?? defaults);
}

/**
 * Format date string to short format (e.g., "8 Apr 2026")
 */
export function formatDateShort(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
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
