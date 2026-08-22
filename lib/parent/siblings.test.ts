import { describe, it, expect } from "vitest";
import { deriveSiblings, type GuardianWithParentLinks } from "./siblings";

function student(id: string, name = id, status = "ACTIVE") {
  return { id, name, status };
}

function guardian(
  links: Array<{ id: string; name?: string; status?: string }>,
  status = "ACTIVE",
): GuardianWithParentLinks {
  return {
    status,
    parent: {
      guardians: links.map((l) => ({
        student: student(l.id, l.name ?? l.id, l.status ?? "ACTIVE"),
      })),
    },
  };
}

describe("deriveSiblings", () => {
  it("returns nothing for an only child", () => {
    expect(deriveSiblings([guardian([{ id: "me" }])], "me")).toEqual([]);
  });

  it("excludes the student themself", () => {
    const out = deriveSiblings([guardian([{ id: "me" }, { id: "kakak" }])], "me");
    expect(out.map((s) => s.id)).toEqual(["kakak"]);
  });

  it("counts a sibling once when both parents are shared", () => {
    // The usual case — mother and father both link to the same two children.
    const ibu = guardian([{ id: "me" }, { id: "adik" }]);
    const ayah = guardian([{ id: "me" }, { id: "adik" }]);
    const out = deriveSiblings([ibu, ayah], "me");
    expect(out.map((s) => s.id)).toEqual(["adik"]);
  });

  it("unions siblings reached through different parents", () => {
    // Half-siblings: one through each parent.
    const ibu = guardian([{ id: "me" }, { id: "adik-ibu" }]);
    const ayah = guardian([{ id: "me" }, { id: "kakak-ayah" }]);
    const out = deriveSiblings([ibu, ayah], "me");
    expect(out.map((s) => s.id).sort()).toEqual(["adik-ibu", "kakak-ayah"]);
  });

  it("ignores links hanging off a deactivated guardian", () => {
    const out = deriveSiblings(
      [guardian([{ id: "me" }, { id: "bekas" }], "INACTIVE")],
      "me",
    );
    expect(out).toEqual([]);
  });

  it("keeps a non-ACTIVE sibling so a withdrawn child stays visible", () => {
    // The guardian link is active; the sibling's own enrolment status is not
    // this function's business — the chip renders it as a StatusBadge.
    const out = deriveSiblings(
      [guardian([{ id: "me" }, { id: "lulus", status: "GRADUATED" }])],
      "me",
    );
    expect(out).toEqual([
      { id: "lulus", name: "lulus", status: "GRADUATED" },
    ]);
  });

  it("tolerates a parent with no link list loaded", () => {
    expect(deriveSiblings([{ status: "ACTIVE", parent: {} }], "me")).toEqual([]);
  });
});
