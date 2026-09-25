import {beforeEach,describe,expect,it,vi} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
const mocks=vi.hoisted(()=>({session:vi.fn(),family:vi.fn(),rows:vi.fn(),sessions:vi.fn(),notes:vi.fn()}));
vi.mock("@/lib/auth",()=>({getSession:mocks.session}));
vi.mock("next/navigation",()=>({redirect:(url:string)=>{throw Error(`redirect:${url}`);}}));
vi.mock("@/lib/parent-helpers",()=>({getParentWithChildren:mocks.family,resolveSelectedChild:(children:Array<{studentId:string}>,id:string)=>children.find(c=>c.studentId===id)??children[0]}));
vi.mock("@/lib/db",()=>({prisma:{studentAttendance:{findMany:mocks.rows},classSession:{findMany:mocks.sessions},studentJournalNote:{findMany:mocks.notes}}}));
vi.mock("@/components/parent/child-selector-tabs",()=>({ChildSelectorTabs:()=>null}));
import Page from "../page";
const child={studentId:"child",studentName:"Alya Putri",studentNickname:"Alya",className:"TK A",programName:"TK"};
beforeEach(()=>{vi.resetAllMocks();mocks.session.mockResolvedValue({role:"GUARDIAN",tenantId:"tenant"});mocks.family.mockResolvedValue({parent:{id:"parent"},children:[child]});mocks.rows.mockResolvedValue([]);mocks.sessions.mockResolvedValue([]);mocks.notes.mockResolvedValue([]);});
describe("parent attendance mixed-day recovery",()=>{
 it("shows both class/status identities instead of a false all-present banner",async()=>{
  const rows=["2026-09-21","2026-09-22","2026-09-23","2026-09-24","2026-09-25"].map(date=>({studentId:"child",classSectionId:"school",sessionId:null,date,status:"PRESENT",notes:null,classSection:{name:"TK A"}}));
  mocks.rows.mockResolvedValue([...rows,{...rows[4],classSectionId:"care",status:"SICK",notes:"Istirahat",classSection:{name:"Daycare"}}]);
  const html=renderToStaticMarkup(await Page({searchParams:Promise.resolve({child:"child",week:"2026-09-21"})}));
  expect(html).toContain("Catatan berbeda");expect(html).toContain("TK A: Hadir");expect(html).toContain("Daycare: Sakit");expect(html).not.toContain("Istirahat");expect(html).not.toContain("Hadir 5 dari 5 hari");expect(html).not.toContain("hadir penuh pekan ini");
 });
 it("queries only actual teacher notes and never labels another guardian as Anda",async()=>{
  const notes=[{id:"teacher",date:"2026-09-25",body:"Teacher message",authorRole:"TEACHER"},{id:"guardian",date:"2026-09-25",body:"Other guardian message",authorRole:"GUARDIAN"},{id:"admin",date:"2026-09-25",body:"Admin message",authorRole:"SCHOOL_ADMIN"}];
  mocks.notes.mockImplementation(async ({where})=>notes.filter(note=>note.authorRole===where.authorRole));
  const html=renderToStaticMarkup(await Page({searchParams:Promise.resolve({child:"child",week:"2026-09-21"})}));
  expect(mocks.notes).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({tenantId:"tenant",studentId:"child",status:"ACTIVE",authorRole:"TEACHER"})}));
  expect(html).toContain("Teacher message");expect(html).not.toContain("Other guardian message");expect(html).not.toContain("Admin message");expect(html).not.toContain("Anda");
 });
 it("preserves a truly missing week without claiming conflicting records",async()=>{
  const html=renderToStaticMarkup(await Page({searchParams:Promise.resolve({child:"child",week:"2025-09-22"})}));
  expect(html).toContain("Belum ada catatan kehadiran");expect(html).not.toContain("Catatan berbeda");
  expect(mocks.rows).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({studentId:{in:["child"]},student:{tenantId:"tenant"}})}));
 });
});
