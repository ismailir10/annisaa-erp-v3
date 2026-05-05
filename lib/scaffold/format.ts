// Locale-aware formatters per foundation spec §5.9.
// Single source: every scaffold-rendered field routes display through `fmt`.
// Dates never reach end-users as raw ISO strings.

const LOCALE = "id-ID";
const TZ = "Asia/Jakarta";
const CURRENCY = "IDR";
const FALLBACK = "—";

type DateInput = Date | string | number | null | undefined;
type NumberInput = number | bigint | null | undefined;

function toDate(v: DateInput): Date | null {
  if (v == null) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === "number") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // string
  const trimmed = v.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toNumber(v: NumberInput): number | null {
  if (v == null) return null;
  if (typeof v === "bigint") return Number(v);
  return Number.isFinite(v) ? v : null;
}

// ICU output for "id-ID" currency embeds a non-breaking space (U+00A0)
// between the symbol and the number. Normalize so consumers can match
// reliably on the ASCII space form.
function normSpace(s: string): string {
  return s.replace(/ /g, " ").replace(/ /g, " ");
}

export const fmt = {
  /** "5 Mei 2026" */
  date(v: DateInput): string {
    const d = toDate(v);
    if (!d) return FALLBACK;
    return new Intl.DateTimeFormat(LOCALE, {
      timeZone: TZ,
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(d);
  },

  /** "5 Mei 2026, 14.30" — Jakarta time */
  dateTime(v: DateInput): string {
    const d = toDate(v);
    if (!d) return FALLBACK;
    return new Intl.DateTimeFormat(LOCALE, {
      timeZone: TZ,
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
  },

  /** "Rp 1.500.000" — IDR, no fraction by default. */
  currency(v: NumberInput, opts?: { showCents?: boolean }): string {
    const n = toNumber(v);
    if (n == null) return FALLBACK;
    return normSpace(
      new Intl.NumberFormat(LOCALE, {
        style: "currency",
        currency: CURRENCY,
        minimumFractionDigits: opts?.showCents ? 2 : 0,
        maximumFractionDigits: opts?.showCents ? 2 : 0,
      }).format(n),
    );
  },

  /** "1.234,5" — Indonesian thousands grouping, decimals optional. */
  number(v: NumberInput, opts?: { decimals?: number }): string {
    const n = toNumber(v);
    if (n == null) return FALLBACK;
    const decimals = opts?.decimals ?? 0;
    return new Intl.NumberFormat(LOCALE, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(n);
  },

  /**
   * Normalize Indonesian phone numbers to "+62 8xx-xxxx-xxxx".
   * Accepts +62, 62, leading-0, and arbitrary spacing/dashes.
   * Returns FALLBACK for null/empty; preserves the input shape only after
   * normalization succeeds (i.e. always emits the +62 form when digits exist).
   */
  phone(v: string | null | undefined): string {
    if (v == null) return FALLBACK;
    let digits = v.replace(/\D/g, "");
    if (digits.startsWith("62")) digits = digits.slice(2);
    else if (digits.startsWith("0")) digits = digits.slice(1);
    if (!digits) return FALLBACK;
    // Group as 3-4-rest (typical Indonesian mobile: 8xx-xxxx-xxxx). Cellular
    // numbers are 9–13 digits after country code; landlines run 7–10.
    const a = digits.slice(0, 3);
    const b = digits.slice(3, 7);
    const c = digits.slice(7);
    const grouped = c ? `${a}-${b}-${c}` : b ? `${a}-${b}` : a;
    return `+62 ${grouped}`;
  },

  /** "5 Zulkaidah 1447 H" — Indonesian Umm al-Qura calendar. */
  hijri(v: DateInput): string {
    const d = toDate(v);
    if (!d) return FALLBACK;
    try {
      return new Intl.DateTimeFormat("id-u-ca-islamic-umalqura", {
        timeZone: TZ,
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(d);
    } catch {
      return FALLBACK;
    }
  },

  /**
   * "baru saja" / "5 menit lalu" / "2 jam lalu" / "3 hari lalu" /
   * "2 bulan lalu" / "1 tahun lalu". Falls back to `fmt.date` beyond 1 year.
   */
  relativeTime(v: DateInput, now: Date = new Date()): string {
    const d = toDate(v);
    if (!d) return FALLBACK;
    const diffMs = now.getTime() - d.getTime();
    const absSec = Math.round(Math.abs(diffMs) / 1000);
    if (absSec < 45) return "baru saja";
    const past = diffMs >= 0;
    const suffix = past ? "lalu" : "lagi";
    const min = Math.round(absSec / 60);
    if (min < 60) return `${min} menit ${suffix}`;
    const hr = Math.round(min / 60);
    if (hr < 24) return `${hr} jam ${suffix}`;
    const day = Math.round(hr / 24);
    if (day < 30) return `${day} hari ${suffix}`;
    const mo = Math.round(day / 30);
    if (mo < 12) return `${mo} bulan ${suffix}`;
    const yr = Math.round(day / 365);
    if (yr < 5) return `${yr} tahun ${suffix}`;
    return fmt.date(d);
  },
};

export type Fmt = typeof fmt;
