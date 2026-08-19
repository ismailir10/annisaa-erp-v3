import { describe, expect, it } from "vitest";
import {
  LEVEL_ORDER,
  LEVEL_CHIP_CLASS,
  LEVEL_CHIP_CLASS_OFF,
  LEVEL_LABEL_SHORT,
  LEVEL_LABEL_LONG,
  LEVEL_HEX,
} from "../level-presentation";

describe("level presentation tokens", () => {
  it("uses a -text token, never a fill token, for unselected chip text", () => {
    // The unselected chip paints its own hue as a background tint and then
    // writes on top of it. `--status-late` (#FF8C00) is a *fill* colour tuned
    // for white text sitting on it; used as text on its own 10% tint it
    // measured 2.22:1 while its two siblings measured 4.16 and 5.65.
    for (const level of LEVEL_ORDER) {
      const classes = LEVEL_CHIP_CLASS_OFF[level].split(/\s+/);
      const textClass = classes.find((c) => c.startsWith("text-"));
      expect(textClass, `${level} has no text class`).toBeDefined();
      expect(textClass, `${level} paints text with a fill token`).toMatch(/-text$/);
    }
  });

  it("keeps the selected chip on white over a solid fill", () => {
    for (const level of LEVEL_ORDER) {
      expect(LEVEL_CHIP_CLASS[level]).toContain("text-white");
    }
  });

  it("covers every level in all four presentation maps", () => {
    for (const level of LEVEL_ORDER) {
      expect(LEVEL_LABEL_SHORT[level]).toBeTruthy();
      expect(LEVEL_LABEL_LONG[level]).toBeTruthy();
      expect(LEVEL_HEX[level]).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it("never renders NEEDS_REINFORCEMENT in the Alpa red", () => {
    // Voice call recorded in level-presentation.ts: a "needs reinforcement"
    // level is an honest developmental note, not an alarm.
    expect(LEVEL_HEX.NEEDS_REINFORCEMENT).toBe("#0EA5E9");
    expect(LEVEL_CHIP_CLASS.NEEDS_REINFORCEMENT).not.toContain("absent");
    expect(LEVEL_CHIP_CLASS_OFF.NEEDS_REINFORCEMENT).not.toContain("absent");
  });
});
