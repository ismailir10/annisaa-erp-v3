import {beforeEach,describe,expect,it,vi} from "vitest";
const db=vi.hoisted(()=>({studentAttendance:{findMany:vi.fn()},classSession:{findMany:vi.fn()}}));
vi.mock("@/lib/db",()=>({prisma:db}));
import {loadParentAttendanceSummary,summarizeParentAttendance} from "./attendance-summary";
const row=(classSectionId:string,status:string,sessionId:string|null=null)=>({studentId:"child",classSectionId,date:"2025-09-25",status,sessionId,notes:null,classSection:{name:classSectionId}});
beforeEach(()=>vi.resetAllMocks());
describe("parent authoritative classroom attendance",()=>{
 it("chooses the same sole-session record as classroom marking despite conflicting legacy rows",()=>{
  const records=[row("school","ABSENT"),row("school","PRESENT","session")];
  for(const input of [records,[...records].reverse()])expect(summarizeParentAttendance(input,[{id:"session",classSectionId:"school",date:"2025-09-25"}]).get("child")?.get("2025-09-25")?.status).toBe("PRESENT");
 });
 it("does not substitute multi-session pickup attendance for a classroom daily record",()=>{
  const sessions=[{id:"morning",classSectionId:"care",date:"2025-09-25"},{id:"afternoon",classSectionId:"care",date:"2025-09-25"}];
  expect(summarizeParentAttendance([row("care","PRESENT","morning")],sessions).size).toBe(0);
 });
 it("shows a common status when classes agree and explicit MIXED when they differ, independent of order",()=>{
  expect(summarizeParentAttendance([row("school","PRESENT"),row("care","PRESENT")],[]).get("child")?.get("2025-09-25")?.status).toBe("PRESENT");
  for(const records of [[row("school","PRESENT"),row("care","SICK")],[row("care","SICK"),row("school","PRESENT")]]){
   const day=summarizeParentAttendance(records,[]).get("child")?.get("2025-09-25");expect(day?.status).toBe("MIXED");expect(day?.classes.map(c=>[c.name,c.status])).toEqual([["care","SICK"],["school","PRESENT"]]);
  }
 });
 it("does not expose internal attendance notes in the guardian summary",()=>{
  const records=[{...row("school","PRESENT"),notes:"Internal staff detail"}];
  const summary=summarizeParentAttendance(records,[]);
  expect(summary.get("child")?.get("2025-09-25")?.classes).toEqual([{id:"school",name:"school",status:"PRESENT"}]);
 });
 it("keeps missing days missing and different pupils separate",()=>{
  const summary=summarizeParentAttendance([row("school","PRESENT"),{...row("school","SICK"),studentId:"sibling"}],[]);
  expect(summary.get("child")?.get("2025-09-24")).toBeUndefined();expect(summary.get("sibling")?.get("2025-09-25")?.status).toBe("SICK");
 });
 it("scopes data and session identity to tenant and authorized children, preserving historical dates",async()=>{
  db.studentAttendance.findMany.mockResolvedValue([row("old-class","PRESENT")]);db.classSession.findMany.mockResolvedValue([]);
  await loadParentAttendanceSummary("tenant",["child"],["2025-09-25"]);
  expect(db.studentAttendance.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{studentId:{in:["child"]},date:{in:["2025-09-25"]},isVoided:false,student:{tenantId:"tenant"},classSection:{tenantId:"tenant"}}}));
  expect(db.studentAttendance.findMany.mock.calls[0][0].select).not.toHaveProperty("notes");
  expect(db.classSession.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{classSectionId:{in:["old-class"]},date:{in:["2025-09-25"]},classSection:{tenantId:"tenant"}}}));
 });
 it("does not turn a failed query into a known-zero summary",async()=>{
  db.studentAttendance.findMany.mockRejectedValue(Error("unavailable"));await expect(loadParentAttendanceSummary("tenant",["child"],["2025-09-25"])).rejects.toThrow("unavailable");
 });
});
