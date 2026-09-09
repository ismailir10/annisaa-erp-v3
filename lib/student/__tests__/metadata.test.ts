import { describe, it, expect } from "vitest";
import {
  parseStudentMetadata,
  splitStudentMetadata,
  buildStudentMetadata,
  healthFlags,
  KNOWN_FIELDS,
  SYSTEM_KEYS,
} from "@/lib/student/metadata";

/** Shape the enrollment convert route actually writes. */
const CONVERTED = {
  religion: "Islam",
  citizenship: "WNI",
  bloodType: "O",
  birthDelivery: "Caesar",
  birthTerm: "Cukup bulan",
  homeLanguage: "Indonesia",
  foodAllergy: "Telur, udang",
  seriousIllness: null,
  weightKg: 18.2,
  heightCm: 110.5,
  headCircumferenceCm: 49,
  siblingsKandung: 2,
  siblingsTiri: 0,
  siblingsAngkat: 0,
  dcareAddon: true,
  priorFamilyAttendees: [{ name: "Khadijah Zahra", yearEntered: "2021" }],
  fromEnrollmentApplication: "app_a81",
};

describe("parseStudentMetadata", () => {
  it("returns null for empty, malformed, and non-object JSON", () => {
    expect(parseStudentMetadata(null)).toBeNull();
    expect(parseStudentMetadata("")).toBeNull();
    expect(parseStudentMetadata("{oops")).toBeNull();
    expect(parseStudentMetadata("[1,2]")).toBeNull();
    expect(parseStudentMetadata('"a string"')).toBeNull();
  });

  it("parses a flat object", () => {
    expect(parseStudentMetadata('{"hobi":"menggambar"}')).toEqual({ hobi: "menggambar" });
  });
});

describe("splitStudentMetadata", () => {
  it("buckets a converted student into known / system / extra", () => {
    const s = splitStudentMetadata(CONVERTED);

    expect(s.known.foodAllergy).toBe("Telur, udang");
    expect(s.known.bloodType).toBe("O");
    // numbers stringify for display
    expect(s.known.weightKg).toBe("18.2");
    expect(s.known.siblingsTiri).toBe("0");

    expect(s.system.fromEnrollmentApplication).toBe("app_a81");
    expect(s.system.dcareAddon).toBe(true);
    expect(s.system.priorFamilyAttendees).toEqual([
      { name: "Khadijah Zahra", yearEntered: "2021" },
    ]);

    // nothing machine-owned or known leaks into the free-form editor
    expect(s.extra).toEqual([]);
  });

  it("omits known keys whose value is null or empty", () => {
    const s = splitStudentMetadata(CONVERTED);
    expect("seriousIllness" in s.known).toBe(false);
  });

  it("routes unrecognised keys to extra so the key/value editor keeps working", () => {
    const s = splitStudentMetadata({ hobi: "Menggambar", antarJemput: "Nenek" });
    expect(s.extra).toEqual([
      { key: "hobi", value: "Menggambar" },
      { key: "antarJemput", value: "Nenek" },
    ]);
    expect(s.known).toEqual({});
  });

  it("survives a null blob", () => {
    const s = splitStudentMetadata(null);
    expect(s.known).toEqual({});
    expect(s.extra).toEqual([]);
    expect(s.system.fromEnrollmentApplication).toBeNull();
    expect(s.system.dcareAddon).toBe(false);
    expect(s.system.priorFamilyAttendees).toEqual([]);
  });

  it("tolerates a priorFamilyAttendees that is not an array", () => {
    const s = splitStudentMetadata({ priorFamilyAttendees: "oops" });
    expect(s.system.priorFamilyAttendees).toEqual([]);
    expect(s.extra).toEqual([]);
  });
});

describe("buildStudentMetadata", () => {
  it("round-trips a converted student without losing or mangling anything", () => {
    const s = splitStudentMetadata(CONVERTED);
    const rebuilt = buildStudentMetadata(s);

    // numbers come back as numbers, not "18.2"
    expect(rebuilt).toMatchObject({
      religion: "Islam",
      bloodType: "O",
      foodAllergy: "Telur, udang",
      weightKg: 18.2,
      heightCm: 110.5,
      siblingsTiri: 0,
      dcareAddon: true,
      fromEnrollmentApplication: "app_a81",
      priorFamilyAttendees: [{ name: "Khadijah Zahra", yearEntered: "2021" }],
    });
    // the null field stays absent rather than becoming ""
    expect("seriousIllness" in (rebuilt ?? {})).toBe(false);
  });

  it("preserves system keys when a known field is edited", () => {
    const s = splitStudentMetadata(CONVERTED);
    s.known.foodAllergy = "Kacang";
    const rebuilt = buildStudentMetadata(s);
    expect(rebuilt?.foodAllergy).toBe("Kacang");
    expect(rebuilt?.fromEnrollmentApplication).toBe("app_a81");
    expect(rebuilt?.priorFamilyAttendees).toEqual([
      { name: "Khadijah Zahra", yearEntered: "2021" },
    ]);
  });

  it("clearing a known field removes the key instead of writing an empty string", () => {
    const s = splitStudentMetadata(CONVERTED);
    s.known.foodAllergy = "   ";
    const rebuilt = buildStudentMetadata(s);
    expect("foodAllergy" in (rebuilt ?? {})).toBe(false);
  });

  it("keeps a non-numeric string in a numeric field verbatim rather than writing NaN", () => {
    const s = splitStudentMetadata(null);
    s.known.weightKg = "kurang tahu";
    expect(buildStudentMetadata(s)?.weightKg).toBe("kurang tahu");
  });

  it("returns null when everything is empty, so the PUT clears the column", () => {
    expect(
      buildStudentMetadata({
        known: {},
        extra: [],
        system: { fromEnrollmentApplication: null, dcareAddon: false, priorFamilyAttendees: [] },
      }),
    ).toBeNull();
  });

  it("drops extra rows with a blank key", () => {
    const rebuilt = buildStudentMetadata({
      known: {},
      extra: [{ key: "  ", value: "x" }, { key: "hobi", value: "Menggambar" }],
      system: { fromEnrollmentApplication: null, dcareAddon: false, priorFamilyAttendees: [] },
    });
    expect(rebuilt).toEqual({ hobi: "Menggambar" });
  });
});

describe("healthFlags", () => {
  it("returns the allergy and illness text when present", () => {
    expect(healthFlags(CONVERTED)).toEqual({ allergy: "Telur, udang", illness: null });
  });

  it("reads the seed's `allergies` key as well as convert's `foodAllergy`", () => {
    expect(healthFlags({ allergies: "Debu" }).allergy).toBe("Debu");
  });

  it("prefers foodAllergy when a row somehow carries both", () => {
    expect(healthFlags({ foodAllergy: "Telur", allergies: "Debu" }).allergy).toBe("Telur");
  });

  it("does not raise a warning for an explicit 'no allergy' value", () => {
    // The seed writes "Tidak ada" for most of the roster — chipping that would
    // train admins to ignore the warning.
    expect(healthFlags({ allergies: "Tidak ada" }).allergy).toBeNull();
    expect(healthFlags({ foodAllergy: "-" }).allergy).toBeNull();
    expect(healthFlags({ seriousIllness: "Tidak ada" }).illness).toBeNull();
  });

  it("falls through to the second key when the first says 'no allergy'", () => {
    expect(healthFlags({ foodAllergy: "Tidak ada", allergies: "Debu" }).allergy).toBe("Debu");
  });

  it("treats whitespace-only as absent", () => {
    expect(healthFlags({ foodAllergy: "   ", seriousIllness: "Asma" })).toEqual({
      allergy: null,
      illness: "Asma",
    });
  });

  it("survives null", () => {
    expect(healthFlags(null)).toEqual({ allergy: null, illness: null });
  });
});

describe("registry invariants", () => {
  it("has no key in both the known list and the system set", () => {
    for (const f of KNOWN_FIELDS) expect(SYSTEM_KEYS.has(f.key)).toBe(false);
  });

  it("has unique known keys", () => {
    const keys = KNOWN_FIELDS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("gives every select field a non-empty option list", () => {
    for (const f of KNOWN_FIELDS) {
      if (f.input === "select") expect(f.options?.length ?? 0).toBeGreaterThan(0);
    }
  });
});
