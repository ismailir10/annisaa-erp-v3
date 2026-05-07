import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CLAUDE_MD = resolve(__dirname, "../../CLAUDE.md");

function loadClaudeMd(): string {
  return readFileSync(CLAUDE_MD, "utf-8");
}

function extractGroundTruthSection(md: string): string {
  const start = md.indexOf("\n## Ground-truth check\n");
  if (start === -1) return "";
  const after = md.slice(start + 1);
  const nextHeading = after.search(/\n## (?!Ground-truth check\b)/);
  return nextHeading === -1 ? after : after.slice(0, nextHeading);
}

describe("CLAUDE.md required-reading + ground-truth-check directives", () => {
  const md = loadClaudeMd();

  it("(a) Read-first banner names the foundation md §18A. Phase Status verbatim", () => {
    expect(md).toContain("## 18A. Phase Status");
    expect(md).toMatch(
      /Read first[\s\S]*?docs\/superpowers\/specs\/2026-05-04-erp-rebuild-foundation-design\.md#18a-phase-status[\s\S]*?Phase Status/i,
    );
  });

  it("(b) `## Ground-truth check` section exists as a top-level heading", () => {
    expect(md).toMatch(/^## Ground-truth check$/m);
  });

  it("(c) Ground-truth section names the literal command `git log origin/staging --oneline -10`", () => {
    const section = extractGroundTruthSection(md);
    expect(section).not.toBe("");
    expect(section).toContain("git log origin/staging --oneline -10");
  });

  it("(d) Ground-truth section cross-references §18A. Phase Status", () => {
    const section = extractGroundTruthSection(md);
    expect(section).not.toBe("");
    expect(section).toContain("## 18A. Phase Status");
  });
});
