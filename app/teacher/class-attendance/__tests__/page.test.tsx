import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

const ok = (data: unknown) => ({ ok: true, json: async () => data });
const assignment = [{ id: "a", classSection: { id: "c1", name: "TK A", program: { name: "TK" }, campus: { name: "A" }, _count: { enrollments: 1 } } }];
const roster = [{ student: { id: "s1", name: "Aisyah", nickname: null, gender: null }, attendance: null }];

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
    await waitFor(() => expect(screen.getByRole("button", { name: /Aisyah — Hadir/ })).toBeInTheDocument());
  });

  it("announces current state and save progress, then restores on failed save", async () => {
    let mark = false;
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      if (url.includes("teaching-assignments")) return Promise.resolve(ok(assignment));
      if (url.includes("student-attendance?")) return Promise.resolve(ok(roster));
      if (url.includes("student-attendance/mark")) return mark ? Promise.resolve({ ok: false, json: async () => ({}) }) : new Promise(() => {});
      return Promise.resolve(ok({}));
    }));
    render(<ClassAttendancePage />);
    const row = await screen.findByRole("button", { name: /Aisyah — Hadir/ });
    expect(row.className).toContain("focus-visible:ring-2");
    fireEvent.click(row);
    expect(await screen.findByRole("status")).toHaveTextContent("Menyimpan absensi");
    mark = true;
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
    expect(await screen.findByRole("button", { name: /Bilal — Hadir/ })).toBeInTheDocument();

    // The stale response must be *handled* before we can claim it was
    // ignored. The `waitFor` this replaces was not a barrier — Bilal is
    // already on screen, so it passed on its first poll — which left the
    // assertions below racing the stale response's flush. `await act`
    // makes that flush deterministic.
    await act(async () => {
      firstRoster.resolve(ok(roster));
    });
    expect(screen.getByRole("button", { name: /Bilal — Hadir/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Aisyah — Hadir/ })).toBeNull();
  });

  it("ignores an older failed save after a newer save succeeds for the same student", async () => {
    const olderSave = deferred<{ ok: boolean; json: () => Promise<unknown> }>();
    const newerSave = deferred<{ ok: boolean; json: () => Promise<unknown> }>();
    let saveCalls = 0;
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      if (url.includes("teaching-assignments")) return Promise.resolve(ok(assignment));
      if (url.includes("student-attendance?")) return Promise.resolve(ok(roster));
      if (url.includes("student-attendance/mark")) {
        return ++saveCalls === 1 ? olderSave.promise : newerSave.promise;
      }
      return Promise.resolve(ok({}));
    }));

    render(<ClassAttendancePage />);
    fireEvent.click(await screen.findByRole("button", { name: /Aisyah — Hadir/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Aisyah — Alpa/ }));
    expect(saveCalls).toBe(1);

    olderSave.resolve({ ok: false, json: async () => ({ error: "stale failure" }) });
    await waitFor(() => expect(saveCalls).toBe(2));
    const requests = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter(([url]) => String(url).includes("student-attendance/mark"));
    expect(JSON.parse(requests[1]![1]!.body).records[0].status).toBe("SICK");
    expect(toastError).not.toHaveBeenCalled();

    newerSave.resolve(ok({ saved: 1 }));
    // "Aisyah — Sakit" is already on screen from the optimistic update, so
    // this find resolves on the first poll and is not a barrier for anything.
    // The live region only flips to "Absensi tersimpan" once the save
    // promise chain settles, so that assertion needs its own wait — asserting
    // it synchronously here read "Menyimpan absensi" on a loaded CI runner.
    expect(await screen.findByRole("button", { name: /Aisyah — Sakit/ })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Absensi tersimpan"),
    );
    expect(toastError).not.toHaveBeenCalled();
  });
});
