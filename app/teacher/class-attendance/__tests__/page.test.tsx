import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ replace: vi.fn(), params: new URLSearchParams() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation, useSearchParams: () => navigation.params }));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectTrigger: ({ children, ...props }: React.HTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
  SelectValue: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
const toastError = vi.hoisted(() => vi.fn());

vi.mock("sonner", () => ({ toast: { error: toastError } }));

import ClassAttendancePage from "../page";
import { within } from "@testing-library/react";

const pick = async (child: string, status: string) =>
  within(await screen.findByRole("radiogroup", { name: `Status ${child}` })).getByRole("radio", { name: status });
const markRequests = () =>
  (fetch as ReturnType<typeof vi.fn>).mock.calls.filter(([url]) => String(url).includes("/mark")).map(([, init]) => JSON.parse(init.body));

const ok = (data: unknown) => ({ ok: true, json: async () => data });
const assignment = [{ id: "a", classSection: { id: "c1", name: "TK A", program: { name: "TK" }, campus: { name: "A" }, _count: { enrollments: 1 } } }];
const roster = [{ student: { id: "s1", name: "Aisyah", nickname: null, gender: null }, attendance: null }];
const classOfThree = [
  ...roster,
  { student: { id: "s2", name: "Bilal", nickname: null, gender: null }, attendance: { status: "SICK", notes: null } },
  { student: { id: "s3", name: "Citra", nickname: null, gender: null }, attendance: null },
];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("ClassAttendancePage recovery", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    toastError.mockClear();
    navigation.params = new URLSearchParams(); navigation.replace.mockClear();
  });

  it("retries assignment loading after failure", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn((url: string) => url.includes("teaching-assignments") && ++calls === 1 ? Promise.reject(new Error()) : Promise.resolve(ok(url.includes("teaching-assignments") ? assignment : roster))));
    render(<ClassAttendancePage />);
    await screen.findByText("Daftar kelas tidak bisa dimuat");
    fireEvent.click(screen.getByRole("button", { name: "Coba lagi" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Absensi kelas" })).toBeInTheDocument());
  });

  it("retries roster loading after failure", async () => {
    let rosterCalls = 0;
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      if (url.includes("teaching-assignments")) return Promise.resolve(ok(assignment));
      if (url.includes("student-attendance?")) return ++rosterCalls === 1 ? Promise.reject(new Error()) : Promise.resolve(ok(roster));
      return Promise.resolve(ok({ saved: 1 }));
    }));
    render(<ClassAttendancePage />);
    await screen.findByText("Data siswa tidak bisa dimuat");
    fireEvent.click(screen.getByRole("button", { name: "Coba lagi" }));
    expect(await pick("Aisyah", "Hadir")).toHaveAttribute("aria-checked", "false");
  });

  it("saves the tapped status, exposes failure on the row, and retries the same choice", async () => {
    const pending = deferred<ReturnType<typeof ok>>(); let saves = 0;
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      if (url.includes("teaching-assignments")) return Promise.resolve(ok(assignment));
      if (url.includes("student-attendance?")) return Promise.resolve(ok(roster));
      return ++saves === 1 ? pending.promise : Promise.resolve(ok({saved:1}));
    }));
    render(<ClassAttendancePage />);
    fireEvent.click(await pick("Aisyah", "Izin"));
    expect(screen.getByRole("status")).toHaveTextContent("Menyimpan absensi");
    expect(screen.getByText("Izin 0")).toBeInTheDocument();
    await act(async () => { pending.reject(Error("offline")); });
    expect(screen.getByRole("alert")).toHaveTextContent("Absensi belum tersimpan");
    expect(await pick("Aisyah", "Izin")).toHaveAttribute("aria-checked", "false");
    fireEvent.click(screen.getByRole("button", {name:"Coba lagi"}));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Absensi tersimpan"));
    expect(markRequests().map((b) => b.records[0].status)).toEqual(["PERMISSION","PERMISSION"]);
    expect(screen.getByText("Izin 1")).toBeInTheDocument();
    expect(await pick("Aisyah", "Izin")).toHaveAttribute("aria-checked", "true");
  });

  it("marks only the children without a status Hadir, in one request", async () => {
    vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
      if (url.includes("teaching-assignments")) return Promise.resolve(ok(assignment));
      if (url.includes("student-attendance?")) return Promise.resolve(ok(classOfThree));
      return Promise.resolve(ok({ saved: JSON.parse(String(init?.body)).records.length }));
    }));
    render(<ClassAttendancePage />);
    fireEvent.click(await screen.findByRole("button", { name: "Tandai 2 siswa lainnya Hadir" }));
    await screen.findByText("Semua siswa sudah dicatat");
    expect(markRequests()).toHaveLength(1);
    expect(markRequests()[0].records).toEqual([
      { studentId: "s1", status: "PRESENT" },
      { studentId: "s3", status: "PRESENT" },
    ]);
    expect(await pick("Bilal", "Sakit")).toHaveAttribute("aria-checked", "true");
    await waitFor(() => expect(screen.getByText("Hadir 2")).toBeInTheDocument());
    expect(screen.getByText("Sakit 1")).toBeInTheDocument();
  });

  it("puts the rows back to belum when the bulk save fails, and the button retries", async () => {
    let saves = 0;
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      if (url.includes("teaching-assignments")) return Promise.resolve(ok(assignment));
      if (url.includes("student-attendance?")) return Promise.resolve(ok(classOfThree));
      return ++saves === 1
        ? Promise.resolve({ ok: false, json: async () => ({ error: "Terlalu banyak permintaan" }) })
        : Promise.resolve(ok({ saved: 2 }));
    }));
    render(<ClassAttendancePage />);
    fireEvent.click(await screen.findByRole("button", { name: "Tandai 2 siswa lainnya Hadir" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Absensi belum tersimpan. Terlalu banyak permintaan");
    expect(await pick("Aisyah", "Hadir")).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText("Hadir 0")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tandai 2 siswa lainnya Hadir" }));
    await screen.findByText("Semua siswa sudah dicatat");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(markRequests()).toHaveLength(2);
  });

  it("keeps the newest class/date roster when an earlier request resolves late", async () => {
    const firstRoster = deferred<ReturnType<typeof ok>>();
    const secondRoster = deferred<ReturnType<typeof ok>>();
    let rosterCalls = 0;
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      if (url.includes("teaching-assignments")) return Promise.resolve(ok(assignment));
      if (url.includes("student-attendance?")) {
        return ++rosterCalls === 1 ? firstRoster.promise : secondRoster.promise;
      }
      return Promise.resolve(ok({ saved: 1 }));
    }));

    render(<ClassAttendancePage />);
    await waitFor(() => expect(rosterCalls).toBe(1));

    // Derive the "other" date from whatever the picker currently holds. A
    // hardcoded literal here silently stops testing anything the day the clock
    // reaches it: the input defaults to today, so `change` to the same value is
    // a no-op, no refetch fires, and this assertion fails. That is exactly what
    // happened on 2026-08-04 with the previous literal "2026-08-04".
    const dateInput = screen.getByLabelText(
      "Tanggal kehadiran",
    ) as HTMLInputElement;
    const otherDay = new Date(`${dateInput.value}T00:00:00Z`);
    otherDay.setUTCDate(otherDay.getUTCDate() - 1);
    fireEvent.change(dateInput, {
      target: { value: otherDay.toISOString().slice(0, 10) },
    });
    await waitFor(() => expect(rosterCalls).toBe(2));

    secondRoster.resolve(ok([
      { student: { id: "s2", name: "Bilal", nickname: null, gender: null }, attendance: null },
    ]));
    expect(await screen.findByRole("radiogroup", { name: "Status Bilal" })).toBeInTheDocument();

    // The stale response must be *handled* before we can claim it was
    // ignored. The `waitFor` this replaces was not a barrier — Bilal is
    // already on screen, so it passed on its first poll — which left the
    // assertions below racing the stale response's flush. `await act`
    // makes that flush deterministic.
    await act(async () => {
      firstRoster.resolve(ok(roster));
    });
    expect(screen.getByRole("radiogroup", { name: "Status Bilal" })).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Status Aisyah" })).toBeNull();
  });

  it("ignores an older failed save after a newer save succeeds for the same student", async () => {
    const olderSave = deferred<{ ok: boolean; json: () => Promise<unknown> }>();
    const newerSave = deferred<{ ok: boolean; json: () => Promise<unknown> }>();
    let saveCalls = 0;
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      if (url.includes("teaching-assignments")) return Promise.resolve(ok(assignment));
      if (url.includes("student-attendance?")) return Promise.resolve(ok(roster.map(r => ({...r, attendance:{status:"PRESENT",notes:null}}))));
      if (url.includes("student-attendance/mark")) {
        return ++saveCalls === 1 ? olderSave.promise : newerSave.promise;
      }
      return Promise.resolve(ok({}));
    }));

    render(<ClassAttendancePage />);
    fireEvent.click(await pick("Aisyah", "Alpa"));
    fireEvent.click(await pick("Aisyah", "Sakit"));
    await waitFor(() => expect(saveCalls).toBe(1));

    olderSave.resolve({ ok: false, json: async () => ({ error: "stale failure" }) });
    await waitFor(() => expect(saveCalls).toBe(2));
    const requests = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter(([url]) => String(url).includes("student-attendance/mark"));
    expect(JSON.parse(requests[1]![1]!.body).records[0].status).toBe("SICK");
    expect(toastError).not.toHaveBeenCalled();

    newerSave.resolve(ok({ saved: 1 }));
    // Sakit is already checked from the optimistic update, so
    // this find resolves on the first poll and is not a barrier for anything.
    // The live region only flips to "Absensi tersimpan" once the save
    // promise chain settles, so that assertion needs its own wait — asserting
    // it synchronously here read "Menyimpan absensi" on a loaded CI runner.
    expect(await pick("Aisyah", "Sakit")).toHaveAttribute("aria-checked", "true");
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Absensi tersimpan"),
    );
    expect(toastError).not.toHaveBeenCalled();
  });
});

it("does not apply an earlier date's failed save to the newly loaded date",async()=>{
 const save=deferred<ReturnType<typeof ok>>();
 vi.stubGlobal("fetch",vi.fn((url:string)=>url.includes("teaching-assignments")?Promise.resolve(ok(assignment)):url.includes("student-attendance?")?Promise.resolve(ok(roster)):save.promise));
 render(<ClassAttendancePage/>);fireEvent.click(await pick("Aisyah","Hadir"));
 await waitFor(()=>expect((fetch as ReturnType<typeof vi.fn>).mock.calls.some(([url])=>String(url).includes("/mark"))).toBe(true));
 const input=screen.getByLabelText("Tanggal kehadiran") as HTMLInputElement;
 const past=new Date(`${input.value}T12:00:00Z`);past.setUTCDate(past.getUTCDate()-1);
 fireEvent.change(input,{target:{value:past.toISOString().slice(0,10)}});
 await waitFor(async()=>expect(await pick("Aisyah","Hadir")).toHaveAttribute("aria-checked","false"));
 await act(async()=>{save.reject(Error("late failure"));});
 expect(screen.queryByRole("alert")).toBeNull();expect(screen.queryByRole("button",{name:"Coba lagi"})).toBeNull();
});
