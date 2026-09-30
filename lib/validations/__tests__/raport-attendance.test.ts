import { describe, it, expect } from "vitest";
import { raportAttendanceSchema, raportUpsertSchema } from "../raport";

const base = { permittedAbsenceDays: 0, sickDays: 0, unexcusedAbsenceDays: 0, totalSchoolDays: 4 };

function issues(v: Record<string, unknown>) {
  const r = raportAttendanceSchema.safeParse({ ...base, ...v });
  return r.success ? [] : r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
}

describe("raportAttendanceSchema (ACAD-1)", () => {
  it("accepts zeros, an exact fit, and totalSchoolDays=0 with all zero", () => {
    expect(issues({})).toEqual([]);
    expect(issues({ sickDays: 2, permittedAbsenceDays: 1, unexcusedAbsenceDays: 1 })).toEqual([]);
    expect(issues({ totalSchoolDays: 0 })).toEqual([]);
  });

  it("rejects each count above school days on its own field", () => {
    expect(issues({ sickDays: 99 })).toEqual([
      { path: "sickDays", message: "Sakit (99) tidak boleh melebihi hari sekolah (4)" },
    ]);
    expect(issues({ permittedAbsenceDays: 5 })[0].path).toBe("permittedAbsenceDays");
    expect(issues({ unexcusedAbsenceDays: 5 })[0].path).toBe("unexcusedAbsenceDays");
  });

  it("rejects any absence when there are no school days", () => {
    expect(issues({ totalSchoolDays: 0, sickDays: 1 })[0].path).toBe("sickDays");
  });

  it("rejects a sum above school days on totalSchoolDays (only when no single count already fails)", () => {
    const out = issues({ sickDays: 2, permittedAbsenceDays: 2, unexcusedAbsenceDays: 2 });
    expect(out).toHaveLength(1);
    expect(out[0].path).toBe("totalSchoolDays");
  });

  it("rejects negatives and fractions with Indonesian messages", () => {
    expect(issues({ sickDays: -1 })[0].message).toBe("Tidak boleh negatif");
    expect(issues({ sickDays: 1.5 })[0].message).toBe("Harus bilangan bulat");
  });

  it("raportUpsertSchema applies the same rule to the full PUT body", () => {
    const body = { sectionLevels: {}, sectionNarratives: {}, ...base, sickDays: 99 };
    const r = raportUpsertSchema.safeParse(body);
    expect(r.success).toBe(false);
    expect(raportUpsertSchema.safeParse({ ...body, sickDays: 1 }).success).toBe(true);
  });
});
