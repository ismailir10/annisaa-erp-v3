import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
const nav = vi.hoisted(() => ({ params: new URLSearchParams() }));
vi.mock("next/navigation", () => ({ useSearchParams: () => nav.params }));
vi.mock("@/components/student-journal/class-day-grid", () => ({ ClassDayGrid: ({ students }: { students: Array<{ id: string; name: string }> }) => <div data-testid="grid">{students.map((s) => `${s.id}:${s.name}`).join(",")}</div> }));
vi.mock("@/components/student-journal/note-compose-dialog", () => ({ NoteComposeDialog: () => null }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
import Page from "../page";
const ok = (data: unknown) => ({ ok: true, json: async () => data });
describe("journal entry recovery", () => {
 it("shows picker recovery for missing params", () => { nav.params = new URLSearchParams(); vi.stubGlobal("fetch", vi.fn()); render(<Page />); expect(screen.getByText("Kelas dan tanggal belum dipilih")).toBeInTheDocument(); });
 it("retries rejected grid fetch", async () => { nav.params = new URLSearchParams("classId=c&date=2026-08-03"); let call=0; vi.stubGlobal("fetch", vi.fn(() => ++call === 1 ? Promise.reject(new Error()) : Promise.resolve(ok({ data: { students: [{ id:"s",name:"A",nickname:null }], categories: [], entries: [] } })))); render(<Page />); await screen.findByText("Data kelas tidak bisa dimuat"); expect(screen.queryByTestId("grid")).toBeNull(); fireEvent.click(screen.getByRole("button", { name:"Coba lagi" })); await waitFor(() => expect(screen.getByTestId("grid")).toBeInTheDocument()); });
 it("names the class the grid belongs to, next to the day", async () => { nav.params = new URLSearchParams("classId=c&date=2026-08-03"); vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(ok({ data: { students: [{ id:"s",name:"A",nickname:null }], categories: [], entries: [], classSection: { id: "c", name: "DCARE" } } })))); render(<Page />); await screen.findByTestId("grid"); expect(screen.getByText("DCARE · Senin, 3 Agustus 2026")).toBeInTheDocument(); });
 it("keeps newer grid response when an older request resolves later", async () => { let resolveA: (v: unknown) => void = () => {}; let call=0; nav.params=new URLSearchParams("classId=a&date=2026-08-03"); vi.stubGlobal("fetch",vi.fn(()=>++call===1?new Promise(r=>{resolveA=r}):Promise.resolve(ok({data:{students:[{id:"b",name:"B",nickname:null}],categories:[],entries:[]}})))); const view=render(<Page/>); nav.params=new URLSearchParams("classId=b&date=2026-08-03"); view.rerender(<Page/>); await waitFor(()=>expect(screen.getByTestId("grid")).toHaveTextContent("b:B")); resolveA(ok({data:{students:[],categories:[],entries:[]}})); await waitFor(()=>expect(screen.getByTestId("grid")).toHaveTextContent("b:B")); });
});
