import { describe, it, expect } from "vitest";
import {
  formatLearningCenter,
  ALL_LEARNING_CENTERS,
} from "@/lib/format";

describe("formatLearningCenter", () => {
  it.each([
    ["WORSHIP", "Sentra Ibadah"],
    ["NATURAL_MATERIALS", "Sentra Bahan Alam"],
    ["ART", "Sentra Seni"],
    ["COOKING", "Sentra Memasak"],
    ["ROLE_PLAY", "Sentra Main Peran"],
    ["BLOCKS", "Sentra Balok"],
    ["PREPARATION", "Sentra Persiapan"],
    ["AREA", "AREA"],
  ])("%s → %s", (input, expected) => {
    expect(formatLearningCenter(input)).toBe(expected);
  });

  it("falls back to the raw enum value when unknown", () => {
    expect(formatLearningCenter("UNKNOWN_FUTURE_CENTER")).toBe(
      "UNKNOWN_FUTURE_CENTER",
    );
  });
});

describe("ALL_LEARNING_CENTERS", () => {
  it("lists all 8 sentra keys in a stable order", () => {
    expect(ALL_LEARNING_CENTERS).toEqual([
      "WORSHIP",
      "NATURAL_MATERIALS",
      "ART",
      "COOKING",
      "ROLE_PLAY",
      "BLOCKS",
      "PREPARATION",
      "AREA",
    ]);
  });
});
