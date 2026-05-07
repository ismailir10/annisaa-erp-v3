import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const FOUNDATION_MD = resolve(
  __dirname,
  "../../docs/superpowers/specs/2026-05-04-erp-rebuild-foundation-design.md",
);

const SHA_OR_DASH = /^[0-9a-f]{7}$|^—$/;
const PR_PATTERN = /^#\d+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const EXPECTED_HEADERS = [
  "Phase",
  "Cycle",
  "Slug",
  "Merged",
  "PR",
  "Tip Commit",
  "Status",
];

interface ParsedTable {
  headers: string[];
  rows: string[][];
}

function parsePhaseStatusTable(md: string): ParsedTable {
  const headingMatch = md.match(
    /^## 18A\. Phase Status — shipped cycle ledger$/m,
  );
  if (!headingMatch) {
    throw new Error("§18A. Phase Status heading not found in foundation md");
  }
  const startIdx = headingMatch.index! + headingMatch[0].length;
  const after = md.slice(startIdx);
  const tableMatch = after.match(/\n\| Phase[\s\S]*?(?=\n\n|\n## |\n### )/);
  if (!tableMatch) {
    throw new Error("Markdown table not found after §18A heading");
  }
  const lines = tableMatch[0].trim().split("\n").filter((l) => l.trim());
  const cells = (line: string) =>
    line
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
  const headers = cells(lines[0]);
  const rows = lines.slice(2).map(cells);
  return { headers, rows };
}

describe("§18A. Phase Status ledger — structural integrity", () => {
  const md = readFileSync(FOUNDATION_MD, "utf-8");
  const { headers, rows } = parsePhaseStatusTable(md);

  it("(a) ledger has at least 20 rows", () => {
    expect(rows.length).toBeGreaterThanOrEqual(20);
  });

  it("(b) every row has exactly 7 cells", () => {
    rows.forEach((row, i) => {
      expect(row.length, `row ${i + 1} (${row.join(" | ")})`).toBe(7);
    });
  });

  it("(c) Tip Commit column matches 7-char short-sha or em-dash", () => {
    rows.forEach((row, i) => {
      const sha = row[5];
      expect(
        SHA_OR_DASH.test(sha),
        `row ${i + 1} sha=${JSON.stringify(sha)}`,
      ).toBe(true);
    });
  });

  it("(d) Merged column is monotonic non-decreasing for shipped rows in row order", () => {
    const shippedDates = rows
      .filter((r) => r[6] === "shipped")
      .map((r) => r[3]);
    for (let i = 1; i < shippedDates.length; i++) {
      expect(
        shippedDates[i] >= shippedDates[i - 1],
        `row ${i + 1} (${shippedDates[i]}) < row ${i} (${shippedDates[i - 1]})`,
      ).toBe(true);
    }
  });

  it("(e) every shipped row's PR column matches #<digits>", () => {
    rows
      .filter((r) => r[6] === "shipped")
      .forEach((row, i) => {
        expect(PR_PATTERN.test(row[4]), `shipped row ${i + 1} PR=${row[4]}`).toBe(
          true,
        );
      });
  });

  it("(f) header row contains literal column names", () => {
    expect(headers).toEqual(EXPECTED_HEADERS);
  });

  it("(g) every shipped row's Merged column matches ISO 8601 (YYYY-MM-DD)", () => {
    rows
      .filter((r) => r[6] === "shipped")
      .forEach((row, i) => {
        expect(
          ISO_DATE.test(row[3]),
          `shipped row ${i + 1} merged=${row[3]}`,
        ).toBe(true);
      });
  });
});
