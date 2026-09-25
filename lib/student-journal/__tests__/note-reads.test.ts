import {beforeEach,describe,expect,it,vi} from "vitest";
const db=vi.hoisted(()=>({studentJournalNoteRead:{findMany:vi.fn()},studentJournalNote:{findMany:vi.fn()}}));
vi.mock("@/lib/db",()=>({prisma:db}));
import {countUnreadNotesByStudent} from "../note-reads";
beforeEach(()=>vi.resetAllMocks());
describe("guardian reply summaries",()=>{
 it("filters guardian authors and tenant, then applies each child's own watermark",async()=>{
  const first=new Date("2026-09-23T00:00:00Z"), second=new Date("2026-09-24T00:00:00Z");
  db.studentJournalNoteRead.findMany.mockResolvedValue([{studentId:"a",lastReadAt:first},{studentId:"b",lastReadAt:second}]);
  db.studentJournalNote.findMany.mockResolvedValue([{studentId:"a",createdAt:second},{studentId:"b",createdAt:second},{studentId:"b",createdAt:new Date("2026-09-25T00:00:00Z")}]);
  expect(await countUnreadNotesByStudent({tenantId:"tenant",studentIds:["a","b"],readerUserId:"teacher",authorRole:"GUARDIAN"})).toEqual({a:1,b:1});
  expect(db.studentJournalNote.findMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({tenantId:"tenant",authorRole:"GUARDIAN",authorUserId:{not:"teacher"},studentId:{in:["a","b"]}})}));
 });
 it("preserves the existing zero-unread contract when a thread has never been opened",async()=>{
  db.studentJournalNoteRead.findMany.mockResolvedValue([]);
  expect(await countUnreadNotesByStudent({tenantId:"tenant",studentIds:["a"],readerUserId:"teacher",authorRole:"GUARDIAN"})).toEqual({});
  expect(db.studentJournalNote.findMany).not.toHaveBeenCalled();
 });
});
