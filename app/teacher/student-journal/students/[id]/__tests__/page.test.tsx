import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({
  push: vi.fn(),
  params: new URLSearchParams("week=2026-08-03"),
}));
const toastError = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "student_1" }),
  useRouter: () => ({ push: nav.push }),
  useSearchParams: () => nav.params,
}));
vi.mock("sonner", () => ({ toast: { error: toastError } }));
vi.mock("@/components/portal/week-grid", () => ({
  WeekGrid: () => <div data-testid="week-grid" />,
}));
vi.mock("@/components/student-journal/note-thread", () => ({
  NoteThread: () => <div data-testid="note-thread" />,
}));
vi.mock("@/components/student-journal/note-compose-dialog", () => ({
  NoteComposeDialog: () => null,
}));

import TeacherStudentWeekPage from "../page";

const weekData = {
  data: {
    weekStart: "2026-08-03",
    dates: ["2026-08-03", "2026-08-04"],
    categories: [],
    entries: [],
    notes: [],
  },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("TeacherStudentWeekPage", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    nav.push.mockClear();
    toastError.mockClear();
  });

  it("shows a retryable error instead of empty history after rejection, then recovers", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(() =>
      ++calls === 1 ? Promise.reject(new Error("Koneksi terputus")) : Promise.resolve({ ok: true, json: async () => weekData }),
    ));
    render(<TeacherStudentWeekPage />);

    await screen.findByText("Data penghubung tidak bisa dimuat");
    expect(screen.queryByTestId("week-grid")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Coba lagi" }));
    await waitFor(() => expect(screen.getByTestId("week-grid")).toBeInTheDocument());
    expect(
      screen.getByText("Riwayat penghubung — hanya bisa dilihat di sini"),
    ).toBeInTheDocument();
  });

  it("uses a deterministic back target and accessible 44px week controls", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => weekData }));
    render(<TeacherStudentWeekPage />);
    await screen.findByTestId("week-grid");

    // Back is a Link now (shared BackLink), not a router.push button.
    expect(screen.getByRole("link", { name: "Kembali" })).toHaveAttribute(
      "href",
      "/teacher/student-journal",
    );

    // Shared WeekNavigator: 44px controls, and "pekan" not "minggu".
    for (const name of ["Pekan sebelumnya", "Pekan berikutnya"]) {
      const control = screen.getByRole("button", { name });
      expect(control.className).toContain("size-11");
      expect(control.className).toContain("focus-visible:ring-2");
    }
  });

  it("ignores a stale prior-week response after week navigation", async () => {
    const first = deferred<{ ok: boolean; json: () => Promise<unknown> }>();
    const second = deferred<{ ok: boolean; json: () => Promise<unknown> }>();
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(() => ++calls === 1 ? first.promise : second.promise));
    render(<TeacherStudentWeekPage />);

    fireEvent.click(screen.getByRole("button", { name: "Pekan berikutnya" }));
    await waitFor(() => expect(calls).toBe(2));
    second.resolve({ ok: true, json: async () => weekData });
    await screen.findByTestId("week-grid");

    first.resolve({
      ok: true,
      json: async () => ({ data: { ...weekData.data, dates: ["2026-07-27"] } }),
    });
    await waitFor(() =>
      expect(
        screen.getByText("Riwayat penghubung — hanya bisa dilihat di sini"),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("3 Agu – 4 Agu")).toBeInTheDocument();
  });
});
