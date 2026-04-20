import { describe, it, expect } from "vitest";
import {
  createAssessmentTemplateSchema,
  updateAssessmentTemplateSchema,
  studentAssessmentSaveSchema,
  assessmentScoreEnum,
} from "@/lib/validations/assessment-template";

describe("assessment-template validators", () => {
  describe("createAssessmentTemplateSchema", () => {
    it("accepts a minimal valid payload", () => {
      const result = createAssessmentTemplateSchema.safeParse({
        programId: "p1",
        name: "Rapor Semester 1",
      });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.type).toBe("SEMESTER");
    });

    it("rejects empty programId", () => {
      const result = createAssessmentTemplateSchema.safeParse({ programId: "", name: "Rapor" });
      expect(result.success).toBe(false);
    });

    it("rejects empty name", () => {
      const result = createAssessmentTemplateSchema.safeParse({ programId: "p1", name: "" });
      expect(result.success).toBe(false);
    });

    it("rejects unknown type", () => {
      const result = createAssessmentTemplateSchema.safeParse({
        programId: "p1",
        name: "X",
        type: "WEEKLY",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("updateAssessmentTemplateSchema", () => {
    it("accepts isActive-only payload", () => {
      const result = updateAssessmentTemplateSchema.safeParse({ isActive: false });
      expect(result.success).toBe(true);
    });
  });

  describe("studentAssessmentSaveSchema", () => {
    it("accepts empty scores with publish=true (publish-only save)", () => {
      const result = studentAssessmentSaveSchema.safeParse({ publish: true });
      expect(result.success).toBe(true);
    });

    it("accepts a batch of score rows", () => {
      const result = studentAssessmentSaveSchema.safeParse({
        scores: [
          { indicatorId: "i1", score: "BSH" },
          { indicatorId: "i2", score: "BSB", notes: "Sangat baik" },
        ],
      });
      expect(result.success).toBe(true);
    });

    it("rejects an invalid score enum", () => {
      const result = studentAssessmentSaveSchema.safeParse({
        scores: [{ indicatorId: "i1", score: "A+" }],
      });
      expect(result.success).toBe(false);
    });

    it("rejects notes longer than 500 chars", () => {
      const result = studentAssessmentSaveSchema.safeParse({
        scores: [{ indicatorId: "i1", score: "BB", notes: "x".repeat(501) }],
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty indicatorId", () => {
      const result = studentAssessmentSaveSchema.safeParse({
        scores: [{ indicatorId: "", score: "MB" }],
      });
      expect(result.success).toBe(false);
    });
  });

  describe("assessmentScoreEnum", () => {
    it("accepts BB/MB/BSH/BSB", () => {
      for (const s of ["BB", "MB", "BSH", "BSB"]) {
        expect(assessmentScoreEnum.safeParse(s).success).toBe(true);
      }
    });
  });
});
