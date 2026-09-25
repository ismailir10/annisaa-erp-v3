import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TeacherHomeClient } from "../home-client";
const refresh = vi.hoisted(()=>vi.fn());
vi.mock("next/navigation",()=>({useRouter:()=>({refresh})}));
const cls={id:"class-1",name:"TK A",rosterCount:2,attendanceRecorded:1,slot:null,journal:{configured:true,totalStudents:2,completeStudents:1,completed:false},replies:[{studentId:"child-2",studentName:"Bilal",count:2}]};
const base={today:"2026-09-25",userName:"Sari",todayRecord:null};
describe("Teacher home next actions",()=>{
  it("shows an assigned class without an instantiated session and preserves class/day",()=>{
    render(<TeacherHomeClient {...base} classes={[cls]} />);
    expect(screen.getByTestId("current-class")).toHaveTextContent("TK A");
    expect(screen.getByRole("link",{name:/Lanjutkan absensi/})).toHaveAttribute("href","/teacher/class-attendance?classId=class-1&date=2026-09-25");
    expect(screen.getByRole("link",{name:/Balasan wali Bilal/})).toHaveAttribute("href","/teacher/student-journal/students/child-2?view=notes#catatan");
  });
  it("promotes journal after saved attendance and retains every pickup session",()=>{
    render(<TeacherHomeClient {...base} classes={[{...cls,attendanceRecorded:2}]} todaySessions={[{id:"s1",slot:"MORNING",className:"TK A",rosterCount:2},{id:"s2",slot:"AFTERNOON",className:"TK A",rosterCount:2}]} />);
    expect(screen.getByRole("link",{name:"Lanjutkan jurnal harian"})).toHaveAttribute("href","/teacher/student-journal/entry?classId=class-1&date=2026-09-25");
    expect(document.querySelector('a[href="/teacher/sessions/s1"]')).not.toBeNull();
    expect(document.querySelector('a[href="/teacher/sessions/s2"]')).not.toBeNull();
  });
  it("keeps check-in retryable after a network failure",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockRejectedValue(new Error("Koneksi terputus")));
    render(<TeacherHomeClient {...base} classes={[cls]} />);
    fireEvent.click(screen.getByRole("button",{name:"Catat masuk"}));
    expect(await screen.findByRole("alert")).toHaveTextContent("Koneksi terputus");
    expect(screen.getByRole("button",{name:"Coba lagi"})).toBeEnabled();
    vi.unstubAllGlobals();
  });
});
