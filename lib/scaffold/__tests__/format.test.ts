import { describe, it, expect } from "vitest";
import { fmt } from "../format";

// Reference Date: 2026-05-05T08:30:00.000Z = 2026-05-05 15:30 WIB.
const REF_ISO = "2026-05-05T08:30:00.000Z";
const REF_DATE = new Date(REF_ISO);
const FALLBACK = "—";

describe("fmt.date", () => {
  it("formats ISO string in id-ID short-month form", () => {
    expect(fmt.date(REF_ISO)).toBe("5 Mei 2026");
  });
  it("formats Date instance", () => {
    expect(fmt.date(REF_DATE)).toBe("5 Mei 2026");
  });
  it("formats epoch number", () => {
    expect(fmt.date(REF_DATE.getTime())).toBe("5 Mei 2026");
  });
  it("returns fallback for null", () => {
    expect(fmt.date(null)).toBe(FALLBACK);
  });
  it("returns fallback for undefined", () => {
    expect(fmt.date(undefined)).toBe(FALLBACK);
  });
  it("returns fallback for empty string", () => {
    expect(fmt.date("")).toBe(FALLBACK);
  });
  it("returns fallback for invalid date string", () => {
    expect(fmt.date("not-a-date")).toBe(FALLBACK);
  });
  it("renders in Jakarta tz (UTC midnight crosses to next day in WIB)", () => {
    // 2026-12-31T23:30:00Z = 2027-01-01 06:30 WIB
    expect(fmt.date("2026-12-31T23:30:00.000Z")).toBe("1 Jan 2027");
  });
});

describe("fmt.dateTime", () => {
  it("formats ISO with Jakarta hour/minute", () => {
    expect(fmt.dateTime(REF_ISO)).toBe("5 Mei 2026, 15.30");
  });
  it("returns fallback on null", () => {
    expect(fmt.dateTime(null)).toBe(FALLBACK);
  });
  it("returns fallback on invalid string", () => {
    expect(fmt.dateTime("garbage")).toBe(FALLBACK);
  });
});

describe("fmt.currency", () => {
  it("formats integer IDR without decimals by default", () => {
    expect(fmt.currency(1_500_000)).toBe("Rp 1.500.000");
  });
  it("formats fractional IDR rounded when showCents=false", () => {
    expect(fmt.currency(1500.49)).toBe("Rp 1.500");
  });
  it("formats with decimals when showCents=true", () => {
    expect(fmt.currency(1500.5, { showCents: true })).toBe("Rp 1.500,50");
  });
  it("handles bigint", () => {
    expect(fmt.currency(9_999_999n)).toBe("Rp 9.999.999");
  });
  it("returns fallback for null", () => {
    expect(fmt.currency(null)).toBe(FALLBACK);
  });
  it("returns fallback for NaN", () => {
    expect(fmt.currency(Number.NaN)).toBe(FALLBACK);
  });
  it("returns fallback for Infinity", () => {
    expect(fmt.currency(Number.POSITIVE_INFINITY)).toBe(FALLBACK);
  });
});

describe("fmt.number", () => {
  it("formats with id-ID thousands grouping (no decimals)", () => {
    expect(fmt.number(1_234_567)).toBe("1.234.567");
  });
  it("respects decimals option", () => {
    expect(fmt.number(1234.56, { decimals: 1 })).toBe("1.234,6");
  });
  it("formats zero", () => {
    expect(fmt.number(0)).toBe("0");
  });
  it("returns fallback for null", () => {
    expect(fmt.number(null)).toBe(FALLBACK);
  });
});

describe("fmt.phone", () => {
  it("normalizes +62 prefix to formatted Indonesian mobile", () => {
    expect(fmt.phone("+6281234567890")).toBe("+62 812-3456-7890");
  });
  it("normalizes leading zero to +62", () => {
    expect(fmt.phone("081234567890")).toBe("+62 812-3456-7890");
  });
  it("strips spaces and dashes", () => {
    expect(fmt.phone("0812-3456-7890")).toBe("+62 812-3456-7890");
    expect(fmt.phone("+62 812 3456 7890")).toBe("+62 812-3456-7890");
  });
  it("handles short numbers", () => {
    // "021123" → strip leading 0 → "21123" → +62 211-23
    expect(fmt.phone("021123")).toBe("+62 211-23");
  });
  it("returns fallback for null", () => {
    expect(fmt.phone(null)).toBe(FALLBACK);
  });
  it("returns fallback for empty string", () => {
    expect(fmt.phone("")).toBe(FALLBACK);
  });
  it("returns fallback when nothing remains after stripping", () => {
    expect(fmt.phone("0")).toBe(FALLBACK);
    expect(fmt.phone("---")).toBe(FALLBACK);
  });
});

describe("fmt.hijri", () => {
  it("formats Date as Indonesian Hijri (Umm al-Qura)", () => {
    expect(fmt.hijri(REF_ISO)).toBe("18 Zulkaidah 1447 H");
  });
  it("returns fallback for null", () => {
    expect(fmt.hijri(null)).toBe(FALLBACK);
  });
  it("returns fallback for invalid date", () => {
    expect(fmt.hijri("nope")).toBe(FALLBACK);
  });
});

describe("fmt.relativeTime", () => {
  const NOW = new Date("2026-05-05T12:00:00.000Z");
  it("'baru saja' under 45s", () => {
    expect(fmt.relativeTime(new Date(NOW.getTime() - 30_000), NOW)).toBe("baru saja");
  });
  it("renders minutes lalu", () => {
    expect(fmt.relativeTime(new Date(NOW.getTime() - 5 * 60_000), NOW)).toBe("5 menit lalu");
  });
  it("renders hours lalu", () => {
    expect(fmt.relativeTime(new Date(NOW.getTime() - 3 * 3600_000), NOW)).toBe("3 jam lalu");
  });
  it("renders days lalu", () => {
    expect(fmt.relativeTime(new Date(NOW.getTime() - 5 * 86_400_000), NOW)).toBe("5 hari lalu");
  });
  it("renders months lalu", () => {
    expect(fmt.relativeTime(new Date(NOW.getTime() - 60 * 86_400_000), NOW)).toBe("2 bulan lalu");
  });
  it("renders years lalu", () => {
    expect(fmt.relativeTime(new Date(NOW.getTime() - 730 * 86_400_000), NOW)).toBe("2 tahun lalu");
  });
  it("falls back to absolute date beyond 5 years", () => {
    expect(fmt.relativeTime(new Date(NOW.getTime() - 6 * 365 * 86_400_000), NOW)).toMatch(/\d{4}/);
  });
  it("'lagi' for future timestamps", () => {
    expect(fmt.relativeTime(new Date(NOW.getTime() + 10 * 60_000), NOW)).toBe("10 menit lagi");
  });
  it("returns fallback for null", () => {
    expect(fmt.relativeTime(null, NOW)).toBe(FALLBACK);
  });
});
