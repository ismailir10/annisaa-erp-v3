import { describe, it, expect } from "vitest";
import { activationDescription, archiveDescription } from "../activation-copy";

const years = [
  { id: "a", name: "2025/2026", status: "ACTIVE" },
  { id: "b", name: "2026/2027", status: "PLANNING" },
  { id: "c", name: "2024/2025", status: "ARCHIVED" },
];

describe("activationDescription (CORE-6)", () => {
  it("names the current active year and says it becomes Perencanaan, as the server does", () => {
    const text = activationDescription(years[1], years);
    expect(text).toContain("2025/2026");
    expect(text).toContain("diubah menjadi Perencanaan");
    expect(text).not.toContain("diarsipkan");
  });

  it("mentions reopening when the target is archived", () => {
    expect(activationDescription(years[2], years)).toContain("dibuka kembali");
  });

  it("has no demotion sentence when nothing is active", () => {
    expect(activationDescription(years[1], [years[1]])).not.toContain("Perencanaan");
  });
});

describe("archiveDescription", () => {
  it("warns that archiving the active year leaves the school without one", () => {
    expect(archiveDescription(years[0])).toContain("tidak punya tahun ajaran aktif");
    expect(archiveDescription(years[1])).not.toContain("tidak punya tahun ajaran aktif");
  });
});
