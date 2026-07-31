import { describe, it, expect } from "vitest";
import {
  buildTemplateGrid,
  bucketKey,
  templateFor,
  planClone,
  TOTAL_TEMPLATE_SLOTS,
  isBucketedSection,
  isClosingSection,
  isLevel,
} from "../templates";

describe("TOTAL_TEMPLATE_SLOTS", () => {
  it("is the master design's 15 bucketed + 3 closing", () => {
    // 5 level-bearing sections × 3 levels + 3 single-content sections.
    expect(TOTAL_TEMPLATE_SLOTS).toBe(18);
  });
});

describe("type guards", () => {
  it("recognises bucketed sections including INTRODUCTION", () => {
    expect(isBucketedSection("INTRODUCTION")).toBe(true);
    expect(isBucketedSection("PERFORMANCE_SHOWCASE")).toBe(true);
    expect(isBucketedSection("CLOSING")).toBe(false);
  });

  it("recognises closing sections", () => {
    expect(isClosingSection("FOLLOW_UP_PLAN")).toBe(true);
    expect(isClosingSection("STEAM")).toBe(false);
  });

  it("recognises the 3 achievement levels", () => {
    expect(isLevel("CONSISTENT")).toBe(true);
    expect(isLevel("BSH")).toBe(false); // legacy 4-level value
  });
});

describe("buildTemplateGrid", () => {
  it("indexes bucketed rows by section:level and closing rows by section", () => {
    const grid = buildTemplateGrid(
      [{ section: "STEAM", level: "CONSISTENT", content: "Ananda konsisten…" }],
      [{ section: "CLOSING", content: "Terima kasih…" }],
    );
    expect(grid.bucketed[bucketKey("STEAM", "CONSISTENT")]).toBe(
      "Ananda konsisten…",
    );
    expect(grid.closing.CLOSING).toBe("Terima kasih…");
    expect(grid.filledCount).toBe(2);
    expect(grid.totalSlots).toBe(18);
  });

  it("treats whitespace-only content as unfilled", () => {
    const grid = buildTemplateGrid(
      [{ section: "STEAM", level: "CONSISTENT", content: "   \n " }],
      [{ section: "CLOSING", content: "" }],
    );
    expect(grid.filledCount).toBe(0);
    expect(grid.bucketed).toEqual({});
    expect(grid.closing).toEqual({});
  });

  it("drops rows with an unknown section or level rather than trusting them", () => {
    const grid = buildTemplateGrid(
      [
        { section: "NOT_A_SECTION", level: "CONSISTENT", content: "x" },
        { section: "STEAM", level: "BSH", content: "y" },
      ],
      [{ section: "STEAM", content: "z" }], // bucketed section in the closing list
    );
    expect(grid.filledCount).toBe(0);
  });

  it("counts a full grid as 18", () => {
    const sections = [
      "INTRODUCTION",
      "RELIGIOUS_MORAL",
      "IDENTITY",
      "STEAM",
      "PERFORMANCE_SHOWCASE",
    ];
    const levels = ["CONSISTENT", "EMERGING", "NEEDS_REINFORCEMENT"];
    const narratives = sections.flatMap((section) =>
      levels.map((level) => ({ section, level, content: `${section}-${level}` })),
    );
    const closings = ["CLOSING", "FOLLOW_UP_PLAN", "HOME_ACTIVITIES"].map(
      (section) => ({ section, content: section }),
    );
    const grid = buildTemplateGrid(narratives, closings);
    expect(grid.filledCount).toBe(TOTAL_TEMPLATE_SLOTS);
  });
});

describe("templateFor", () => {
  const grid = buildTemplateGrid(
    [
      { section: "STEAM", level: "CONSISTENT", content: "steam-konsisten" },
      { section: "STEAM", level: "EMERGING", content: "steam-berkembang" },
    ],
    [{ section: "CLOSING", content: "penutup" }],
  );

  it("returns the narrative for the selected level", () => {
    expect(templateFor(grid, "STEAM", "CONSISTENT")).toBe("steam-konsisten");
    expect(templateFor(grid, "STEAM", "EMERGING")).toBe("steam-berkembang");
  });

  it("returns null for a level with no authored template", () => {
    expect(templateFor(grid, "STEAM", "NEEDS_REINFORCEMENT")).toBeNull();
  });

  it("ignores the level for closing sections", () => {
    expect(templateFor(grid, "CLOSING", null)).toBe("penutup");
    expect(templateFor(grid, "CLOSING", "CONSISTENT")).toBe("penutup");
  });

  it("returns null when no level is selected on a bucketed section", () => {
    // INTRODUCTION before the admin picks a level — must leave the field
    // alone, never clear it.
    expect(templateFor(grid, "STEAM", null)).toBeNull();
    expect(templateFor(grid, "STEAM", undefined)).toBeNull();
  });

  it("returns null for an unknown section", () => {
    expect(templateFor(grid, "NOPE", "CONSISTENT")).toBeNull();
  });
});

describe("planClone", () => {
  const source = buildTemplateGrid(
    [
      { section: "STEAM", level: "CONSISTENT", content: "src-steam" },
      { section: "IDENTITY", level: "EMERGING", content: "src-identity" },
    ],
    [{ section: "CLOSING", content: "src-closing" }],
  );

  it("copies every slot into an empty target", () => {
    const target = buildTemplateGrid([], []);
    const plan = planClone(source, target);
    expect(plan.bucketed).toHaveLength(2);
    expect(plan.closing).toHaveLength(1);
    expect(plan.skipped).toBe(0);
    expect(plan.bucketed).toContainEqual({
      section: "STEAM",
      level: "CONSISTENT",
      content: "src-steam",
    });
  });

  it("skips slots the target has already authored", () => {
    const target = buildTemplateGrid(
      [{ section: "STEAM", level: "CONSISTENT", content: "sudah ditulis" }],
      [{ section: "CLOSING", content: "penutup sendiri" }],
    );
    const plan = planClone(source, target);
    expect(plan.skipped).toBe(2);
    expect(plan.bucketed).toEqual([
      { section: "IDENTITY", level: "EMERGING", content: "src-identity" },
    ]);
    expect(plan.closing).toEqual([]);
  });

  it("writes nothing when the source is empty", () => {
    const plan = planClone(buildTemplateGrid([], []), source);
    expect(plan.bucketed).toEqual([]);
    expect(plan.closing).toEqual([]);
    expect(plan.skipped).toBe(0);
  });
});
