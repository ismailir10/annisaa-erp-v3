import { describe, it, expect } from "vitest";
import { rollForwardSchema } from "@/lib/validations/roll-forward";

describe("rollForwardSchema", () => {
  it("accepts a sourceYearId with an empty trackIds array", () => {
    expect(
      rollForwardSchema.safeParse({ sourceYearId: "ay-1", trackIds: [] }).success,
    ).toBe(true);
  });

  it("accepts a sourceYearId with no trackIds (omitted)", () => {
    const parsed = rollForwardSchema.safeParse({ sourceYearId: "ay-1" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.trackIds).toBeUndefined();
  });

  it("accepts a populated trackIds array", () => {
    expect(
      rollForwardSchema.safeParse({
        sourceYearId: "ay-1",
        trackIds: ["track-1", "track-2"],
      }).success,
    ).toBe(true);
  });

  it("rejects an empty sourceYearId", () => {
    expect(rollForwardSchema.safeParse({ sourceYearId: "" }).success).toBe(false);
  });

  it("rejects a missing sourceYearId", () => {
    expect(rollForwardSchema.safeParse({ trackIds: [] }).success).toBe(false);
  });

  it("rejects an empty string inside trackIds", () => {
    expect(
      rollForwardSchema.safeParse({ sourceYearId: "ay-1", trackIds: [""] }).success,
    ).toBe(false);
  });

  it("rejects a non-string trackIds entry", () => {
    expect(
      rollForwardSchema.safeParse({ sourceYearId: "ay-1", trackIds: [123] }).success,
    ).toBe(false);
  });

  it("accepts a trackIds array at the 500 cap", () => {
    expect(
      rollForwardSchema.safeParse({
        sourceYearId: "ay-1",
        trackIds: Array.from({ length: 500 }, (_, i) => `track-${i}`),
      }).success,
    ).toBe(true);
  });

  it("rejects a trackIds array over the 500 cap", () => {
    expect(
      rollForwardSchema.safeParse({
        sourceYearId: "ay-1",
        trackIds: Array.from({ length: 501 }, (_, i) => `track-${i}`),
      }).success,
    ).toBe(false);
  });
});
