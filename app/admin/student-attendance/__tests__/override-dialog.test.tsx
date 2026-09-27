/**
 * T4 (2026-09-27, admin-forms-rhf) — "Timpa Kehadiran" now runs on
 * react-hook-form + zodResolver (`updateStudentAttendanceSchema`, reused
 * as-is — the dialog's fields already match the API shape).
 *
 * Kept in its own file, not appended to `page.test.tsx`: this page mounts
 * three independent fetch effects (class-sections, stats, list) plus a
 * second, eagerly-mounted tab (`RecapView`, its own `/recap` fetch) behind
 * `AdminTabs`. Under CPU contention from other files/tests in the same
 * `vitest run` (confirmed reproducible even against a single, unrelated
 * node-env file run alongside it — this repo's documented oversubscription
 * flake class, see `scripts/flake-hunt.sh`), a click on the row's Base UI
 * `DropdownMenu` trigger can race one of those effects and never open the
 * popup at all — reproduced identically against the pre-migration file, so
 * it predates this cycle and isn't specific to the RHF change. `openOverrideDialog`
 * below settles every pending effect (repeated `act`-wrapped ticks) before
 * the first click and retries the click itself if the menu still doesn't
 * open; each alone was still flaky under contention; combined, four
 * back-to-back multi-file runs were clean. `app/admin/guardians` and
 * `app/admin/fees`'s row-menu tests don't need this — neither page has a
 * second concurrently-mounted tab.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import StudentAttendancePage from "../page";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const CLASS_SECTIONS = [
  {
    id: "cs-1",
    name: "TK B 1",
    academicYear: { id: "ay-1", name: "2026/2027", status: "ACTIVE" },
    capacity: 20,
    _count: { enrollments: 10 },
  },
];

const record = {
  id: "att-1",
  date: "2026-09-20",
  status: "PRESENT",
  notes: null,
  student: { id: "s1", name: "Aisyah Putri", nickname: null },
  classSection: { id: "cs-1", name: "TK B 1" },
};

function stubFetchWithRecord() {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/class-sections")) {
      return Promise.resolve({ ok: true, json: async () => CLASS_SECTIONS } as Response);
    }
    if (url.includes("/api/student-attendance/stats")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ present: 0, absent: 0, sick: 0, permission: 0 }),
      } as Response);
    }
    if (url.includes("/api/student-attendance/att-1") && init?.method === "PUT") {
      return Promise.resolve({ ok: true, json: async () => ({ ...record, status: "SICK" }) } as Response);
    }
    if (url.includes("/api/student-attendance?")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          data: [record],
          pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        }),
      } as Response);
    }
    return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
  });
}

describe("StudentAttendancePage — Timpa Kehadiran dialog (RHF)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", stubFetchWithRecord());
  });

  async function openOverrideDialog(user: ReturnType<typeof userEvent.setup>) {
    render(<StudentAttendancePage />);
    await screen.findByText("Aisyah Putri");
    // Base UI Menu — real pointer sequence via userEvent (see
    // app/admin/fees/__tests__/page.test.tsx and
    // app/admin/guardians/__tests__/page.test.tsx for the same pattern).
    // Retried: under CPU contention from other test files/projects running
    // in the same `vitest run` (this repo's documented oversubscription
    // flake class — see `scripts/flake-hunt.sh` and CLAUDE.md's Testing
    // gates section), a single click on this page's trigger can lose the
    // race against one of its three mount-time fetch effects and never
    // open the menu at all; re-clicking recovers it.
    for (let i = 0; i < 20; i++) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });
    }
    const trigger = await screen.findByRole("button", { name: "Buka menu aksi" });
    let timpa: HTMLElement | null = null;
    for (let attempt = 0; attempt < 5 && !timpa; attempt++) {
      await user.click(trigger);
      timpa = screen.queryByRole("menuitem", { name: "Timpa" });
      if (!timpa) {
        await new Promise((r) => setTimeout(r, 100));
        timpa = screen.queryByRole("menuitem", { name: "Timpa" });
      }
    }
    if (!timpa) throw new Error("Dropdown menu never opened for the Buka menu aksi trigger");
    await user.click(timpa);
    return screen.findByRole("dialog", { name: "Timpa Kehadiran" });
  }

  it("submits a PUT with the selected status and notes on a valid save", async () => {
    const user = userEvent.setup();
    const dialog = await openOverrideDialog(user);

    await user.click(within(dialog).getByLabelText("Status Kehadiran"));
    await user.click(await screen.findByRole("option", { name: "Sakit" }));

    const notesField = within(dialog).getByLabelText("Catatan (opsional)");
    await user.type(notesField, "Demam ringan");

    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));

    const { toast } = await import("sonner");
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Kehadiran ditimpa"));

    const putCall = vi.mocked(fetch).mock.calls.find(
      ([reqUrl, init]) =>
        String(reqUrl).includes("/api/student-attendance/att-1") &&
        (init as RequestInit | undefined)?.method === "PUT",
    );
    expect(putCall).toBeTruthy();
    const [, putInit] = putCall as [string, RequestInit];
    const body = JSON.parse(putInit.body as string);
    expect(body.status).toBe("SICK");
    expect(body.notes).toBe("Demam ringan");
  });

  it("clearing Catatan sends notes: null (the pre-migration `notes || null` contract)", async () => {
    const user = userEvent.setup();
    const dialog = await openOverrideDialog(user);

    // Nothing typed — Catatan starts blank ("" from the record's null notes).
    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));

    await waitFor(() => {
      const putCall = vi
        .mocked(fetch)
        .mock.calls.find(
          ([reqUrl, init]) =>
            String(reqUrl).includes("/api/student-attendance/att-1") &&
            (init as RequestInit | undefined)?.method === "PUT",
        );
      expect(putCall).toBeTruthy();
    });
    const putCall = vi.mocked(fetch).mock.calls.find(
      ([reqUrl, init]) =>
        String(reqUrl).includes("/api/student-attendance/att-1") &&
        (init as RequestInit | undefined)?.method === "PUT",
    ) as [string, RequestInit];
    const body = JSON.parse(putCall[1].body as string);
    expect(body.status).toBe("PRESENT");
    expect(body.notes).toBeNull();
  });
});
