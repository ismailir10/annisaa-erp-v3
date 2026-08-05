import { describe, expect, it } from "vitest";
import { disambiguateClassLabels } from "@/lib/format";

describe("disambiguateClassLabels", () => {
  it("leaves unique names bare", () => {
    expect(
      disambiguateClassLabels([
        { id: "a", name: "TKIT-A", campusName: "Taman Aster" },
        { id: "b", name: "KB", campusName: "Puri Bintaro" },
      ]),
    ).toEqual([
      { id: "a", label: "TKIT-A" },
      { id: "b", label: "KB" },
    ]);
  });

  it("appends the campus to colliding names only", () => {
    // The live defect: /admin/raport showed "TKIT-A" four times over.
    expect(
      disambiguateClassLabels([
        { id: "a", name: "TKIT-A", campusName: "Taman Aster" },
        { id: "b", name: "TKIT-A", campusName: "Puri Bintaro" },
        { id: "c", name: "DCARE", campusName: "Taman Aster" },
      ]),
    ).toEqual([
      { id: "a", label: "TKIT-A · Taman Aster" },
      { id: "b", label: "TKIT-A · Puri Bintaro" },
      { id: "c", label: "DCARE" },
    ]);
  });

  it("does not render a dangling separator when a collision has no campus", () => {
    expect(
      disambiguateClassLabels([
        { id: "a", name: "TKIT-A", campusName: null },
        { id: "b", name: "TKIT-A" },
        { id: "c", name: "TKIT-A", campusName: "   " },
      ]),
    ).toEqual([
      { id: "a", label: "TKIT-A" },
      { id: "b", label: "TKIT-A" },
      { id: "c", label: "TKIT-A" },
    ]);
  });

  it("handles an empty list", () => {
    expect(disambiguateClassLabels([])).toEqual([]);
  });
});
