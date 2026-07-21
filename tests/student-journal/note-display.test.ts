import { describe, expect, it } from "vitest";
import {
  getNoteAuthorInitials,
  getNoteAuthorLabel,
  roleLabel,
} from "@/lib/student-journal/note-display";

describe("student-journal note display helpers", () => {
  describe("roleLabel", () => {
    it("maps known roles to Indonesian labels", () => {
      expect(roleLabel("TEACHER")).toBe("Guru");
      expect(roleLabel("GUARDIAN")).toBe("Orang Tua");
      expect(roleLabel("SCHOOL_ADMIN")).toBe("Admin");
      expect(roleLabel("SUPER_ADMIN")).toBe("Admin");
    });

    it("falls back to the raw role for unknown values", () => {
      expect(roleLabel("UNKNOWN_ROLE")).toBe("UNKNOWN_ROLE");
    });
  });

  describe("getNoteAuthorLabel", () => {
    it("returns the author name when present", () => {
      expect(getNoteAuthorLabel("Bu Sari", "TEACHER")).toBe("Bu Sari");
    });

    it("falls back to the role label when authorName is missing", () => {
      expect(getNoteAuthorLabel(undefined, "TEACHER")).toBe("Guru");
      expect(getNoteAuthorLabel(null, "GUARDIAN")).toBe("Orang Tua");
    });

    it("falls back to the role label when authorName is blank", () => {
      expect(getNoteAuthorLabel("   ", "SCHOOL_ADMIN")).toBe("Admin");
    });
  });

  describe("getNoteAuthorInitials", () => {
    it("derives two initials from a two-word name", () => {
      expect(getNoteAuthorInitials("Bu Sari", "TEACHER")).toBe("BS");
    });

    it("derives two initials from the first two words of a longer name", () => {
      expect(getNoteAuthorInitials("Siti Nur Fatimah", "TEACHER")).toBe("SN");
    });

    it("derives two letters from a single-word name", () => {
      expect(getNoteAuthorInitials("Fatimah", "GUARDIAN")).toBe("FA");
    });

    it("falls back to the role label's first letter when authorName is missing", () => {
      expect(getNoteAuthorInitials(undefined, "TEACHER")).toBe("G");
      expect(getNoteAuthorInitials(null, "GUARDIAN")).toBe("O");
      expect(getNoteAuthorInitials("   ", "SCHOOL_ADMIN")).toBe("A");
    });
  });
});
