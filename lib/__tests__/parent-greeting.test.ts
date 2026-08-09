import { describe, expect, it } from "vitest";
import { parentGreetingName, parentHonorific } from "@/lib/parent-greeting";
import { timeOfDayGreeting } from "@/lib/hijri";

const JAKARTA = "Asia/Jakarta";

describe("parentGreetingName", () => {
  it("strips an honorific already stored in Parent.name", () => {
    // The live defect: "Ibu Rina" greeted as "Bu Ibu".
    expect(parentGreetingName("Ibu Rina")).toBe("Rina");
    expect(parentGreetingName("Bapak Hendra Hakim")).toBe("Hendra");
  });

  it("handles abbreviated and punctuated honorifics", () => {
    expect(parentGreetingName("Bpk. Hendra")).toBe("Hendra");
    expect(parentGreetingName("bu siti")).toBe("siti");
  });

  it("leaves a bare first name alone", () => {
    expect(parentGreetingName("Rina")).toBe("Rina");
    expect(parentGreetingName("Rina Kartika")).toBe("Rina");
  });

  it("does not strip a name that only looks like an honorific", () => {
    // Nothing left to greet — better "Ibu" than an empty string.
    expect(parentGreetingName("Ibu")).toBe("Ibu");
  });

  it("tolerates padding and collapsed whitespace", () => {
    expect(parentGreetingName("  Ibu   Rina  ")).toBe("Rina");
  });
});

describe("parentHonorific", () => {
  it("greets AYAH as Pak", () => {
    // The live defect: code compared against "FATHER", DB stores "AYAH".
    expect(parentHonorific("AYAH")).toBe("Pak");
    expect(parentHonorific("ayah")).toBe("Pak");
  });

  it("greets IBU and WALI as Bu", () => {
    expect(parentHonorific("IBU")).toBe("Bu");
    expect(parentHonorific("WALI")).toBe("Bu");
    expect(parentHonorific("OTHER")).toBe("Bu");
  });

  it("defaults to Bu when the relationship is missing or unknown", () => {
    expect(parentHonorific(null)).toBe("Bu");
    expect(parentHonorific(undefined)).toBe("Bu");
    expect(parentHonorific("")).toBe("Bu");
    expect(parentHonorific("PENGASUH")).toBe("Bu");
  });
});

describe("timeOfDayGreeting", () => {
  // 2026-08-05T11:05:00Z === 18:05 WIB — the exact live observation that
  // rendered "Selamat siang" from a server component.
  const evening = new Date("2026-08-05T11:05:00Z");

  it("reads the Jakarta hour when a timezone is given", () => {
    expect(timeOfDayGreeting(evening, JAKARTA)).toBe("malam");
  });

  it("differs from UTC at the same instant — the bug this argument prevents", () => {
    // Vercel runs UTC; 11:05Z is "siang" there but 18:05 = "malam" in WIB.
    // Asserted against an explicit "UTC" rather than the host clock so the
    // result does not depend on where the test runs.
    expect(timeOfDayGreeting(evening, "UTC")).toBe("siang");
    expect(timeOfDayGreeting(evening, JAKARTA)).toBe("malam");
  });

  it("covers every band in Jakarta terms", () => {
    // 03:00Z = 10:00 WIB, 05:00Z = 12:00 WIB, 09:00Z = 16:00 WIB, 15:00Z = 22:00 WIB
    expect(timeOfDayGreeting(new Date("2026-08-05T03:00:00Z"), JAKARTA)).toBe("pagi");
    expect(timeOfDayGreeting(new Date("2026-08-05T05:00:00Z"), JAKARTA)).toBe("siang");
    expect(timeOfDayGreeting(new Date("2026-08-05T09:00:00Z"), JAKARTA)).toBe("sore");
    expect(timeOfDayGreeting(new Date("2026-08-05T15:00:00Z"), JAKARTA)).toBe("malam");
  });

  it("normalises Jakarta midnight to hour 0, not 24", () => {
    // 2026-08-05T17:00:00Z === 00:00 WIB on the 6th. en-GB renders "24".
    expect(timeOfDayGreeting(new Date("2026-08-05T17:00:00Z"), JAKARTA)).toBe("pagi");
  });
});
