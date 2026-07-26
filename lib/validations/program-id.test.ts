import { describe, it, expect } from "vitest";
import { programIdSchema } from "./program-id";

describe("programIdSchema", () => {
  it("accepts a cuid()-shaped id", () => {
    const result = programIdSchema.safeParse("c" + "a".repeat(24));
    expect(result.success).toBe(true);
  });

  it("accepts a prefixed (non-cuid) id — prod Program ids aren't all cuid()-shaped", () => {
    const result = programIdSchema.safeParse("program_ab57fd0432e25d5b3013");
    expect(result.success).toBe(true);
  });

  it("trims whitespace", () => {
    const result = programIdSchema.safeParse("  program_ab57fd0432e25d5b3013  ");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("program_ab57fd0432e25d5b3013");
  });

  it("rejects an empty string", () => {
    const result = programIdSchema.safeParse("");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toBe("Program tidak valid");
  });

  it("rejects whitespace-only", () => {
    const result = programIdSchema.safeParse("   ");
    expect(result.success).toBe(false);
  });
});
