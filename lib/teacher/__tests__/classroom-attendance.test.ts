import {expect,it} from "vitest";
import {classroomAttendanceByStudent as select} from "../classroom-attendance";
const legacy={studentId:"a",sessionId:null,status:"ABSENT"};
const session={studentId:"a",sessionId:"session",status:"PRESENT"};
it("prefers the exact sole-session save over an older legacy row in either order",()=>{
 for(const rows of [[session,legacy],[legacy,session]]) expect(select(rows,["session"]).get("a")?.status).toBe("PRESENT");
});
it("uses a legacy fallback when a sole session has no saved attendance",()=>{expect(select([legacy],["session"]).get("a")).toBe(legacy);});
it("keeps multi-session pickup separate from the classroom daily record",()=>{
 expect(select([session],["session","afternoon"]).size).toBe(0);
 expect(select([session,legacy],["session","afternoon"]).get("a")).toBe(legacy);
});
it("ignores session records on a no-session classroom day",()=>{expect(select([session,legacy],[]).get("a")).toBe(legacy);});
