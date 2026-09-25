import { describe, expect, it } from "vitest";
import { parentHref, parentHrefWithChild, resolveParentChildId } from "./navigation";

describe("parent child navigation", () => {
  const linked = ["first", "second"];

  it("retains a linked second child across destinations and rejects foreign ids", () => {
    expect(parentHrefWithChild("/parent/reports", new URLSearchParams("child=second&week=2026-08-10"), linked))
      .toBe("/parent/reports?child=second");
    expect(parentHrefWithChild("/parent/student-journal", new URLSearchParams("child=foreign"), linked))
      .toBe("/parent/student-journal?child=first");
    expect(resolveParentChildId([], "foreign")).toBeNull();
  });

  it("keeps page-local context when switching children without accepting a second child override", () => {
    expect(parentHref("/parent/student-journal", "second", {
      child: "foreign", view: "notes", week: "2026-08-10",
    })).toBe("/parent/student-journal?child=second&view=notes&week=2026-08-10");
  });
});
