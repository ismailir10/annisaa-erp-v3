import { describe, expect, it } from "vitest";
import { getJournalProgress, resolveTeacherDate, teacherSlotRank, compareTeacherClasses } from "../home-progress";
describe("teacher work summaries", () => {
  it("requires every active indicator for each active student, ignoring duplicate and retired ticks", () => {
    const input = {studentIds:["a","b"],indicatorIds:["i","j"],entries:[
      {studentId:"a",indicatorId:"i",checked:true},{studentId:"a",indicatorId:"j",checked:true},
      {studentId:"a",indicatorId:"j",checked:true},{studentId:"b",indicatorId:"i",checked:true},
      {studentId:"b",indicatorId:"retired",checked:true},{studentId:"withdrawn",indicatorId:"j",checked:true}]};
    expect(getJournalProgress(input)).toEqual({configured:true,totalStudents:2,completeStudents:1,completed:false});
    expect(getJournalProgress({...input, entries:[...input.entries,{studentId:"b",indicatorId:"j",checked:true}]}).completed).toBe(true);
  });
  it("does not claim completion with no indicators or no pupils", () => {
    expect(getJournalProgress({studentIds:["a"],indicatorIds:[],entries:[]}).configured).toBe(false);
    expect(getJournalProgress({studentIds:[],indicatorIds:["i"],entries:[]}).completed).toBe(false);
  });
  it("rejects impossible and noncanonical dates", () => {
    for (const date of ["2026-02-30","2026-13-01","2026-1-01","","foo"]) expect(resolveTeacherDate(date,"2026-09-25")).toBe("2026-09-25");
    expect(resolveTeacherDate("2024-02-29", "fallback")).toBe("2024-02-29");
  });
  it("prioritizes afternoon sessions in school afternoon", () => {
    expect(teacherSlotRank("AFTERNOON",14)).toBeLessThan(teacherSlotRank("MORNING",14));
    expect(teacherSlotRank("MORNING",8)).toBeLessThan(teacherSlotRank("AFTERNOON",8));
  });
});

it("defaults to homeroom when no class has a timetable, while preserving effective-session priority", () => {
 const homeroom = {slot:null,isHomeroom:true};
 const assistant = {slot:null,isHomeroom:false};
 expect(compareTeacherClasses(homeroom,assistant,9)).toBeLessThan(0);
 expect(compareTeacherClasses({...assistant,slot:"MORNING"},homeroom,9)).toBeLessThan(0);
 expect(compareTeacherClasses({...assistant,slot:"AFTERNOON"},{...homeroom,slot:"MORNING"},14)).toBeLessThan(0);
 expect(compareTeacherClasses({...homeroom,slot:"MORNING"},{...assistant,slot:"MORNING"},9)).toBeLessThan(0);
});
