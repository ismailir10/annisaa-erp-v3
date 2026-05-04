import { describe, it, expect } from "vitest";
import { countIncompleteStudents } from "../client";

describe("countIncompleteStudents", () => {
  it("returns 0 when student list is empty", () => {
    expect(countIncompleteStudents([], 5)).toBe(0);
  });

  it("returns 0 when all students have complete scores", () => {
    const students = [
      { scoredCount: 24 },
      { scoredCount: 24 },
      { scoredCount: 24 },
    ];
    expect(countIncompleteStudents(students, 24)).toBe(0);
  });

  it("returns 2 when 2 of 3 students are incomplete", () => {
    const students = [
      { scoredCount: 10 },  // incomplete
      { scoredCount: 24 },  // complete
      { scoredCount: 0 },   // incomplete
    ];
    expect(countIncompleteStudents(students, 24)).toBe(2);
  });

  it("returns 0 when there are 0 students with incomplete scores", () => {
    const students = [{ scoredCount: 5 }, { scoredCount: 5 }];
    expect(countIncompleteStudents(students, 5)).toBe(0);
  });

  it("counts a student exactly at totalIndicators as complete", () => {
    const students = [{ scoredCount: 10 }];
    expect(countIncompleteStudents(students, 10)).toBe(0);
  });

  it("counts a student at totalIndicators - 1 as incomplete", () => {
    const students = [{ scoredCount: 9 }];
    expect(countIncompleteStudents(students, 10)).toBe(1);
  });

  it("returns 0 when totalIndicators is 0 (edge: no indicators defined)", () => {
    const students = [{ scoredCount: 0 }, { scoredCount: 0 }];
    expect(countIncompleteStudents(students, 0)).toBe(0);
  });
});
