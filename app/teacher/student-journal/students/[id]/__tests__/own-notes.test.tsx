import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ params: new URLSearchParams("week=2026-09-28") }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "student_1" }),
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => nav.params,
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/components/portal/week-grid", () => ({ WeekGrid: () => <div data-testid="week-grid" /> }));

import TeacherStudentWeekPage from "../page";

const week = {
  data: {
    weekStart: "2026-09-28",
    dates: ["2026-09-28", "2026-09-29"],
    student: { id: "student_1", name: "Bilal", nickname: null, classNames: ["TKIT A"], classes: [{ id: "c1", name: "TKIT A" }] },
    categories: [],
    entries: [],
    notes: [],
  },
};
const note = (id: string, authorUserId: string, authorRole: string, body: string) => ({
  id, date: "2026-09-29", authorRole, authorUserId, authorName: "X", body, createdAt: "2026-09-29T01:00:00.000Z",
});
const thread = [
  note("mine", "u-me", "TEACHER", "Catatan saya"),
  note("colleague", "u-other", "TEACHER", "Catatan rekan"),
  note("parent", "u-parent", "GUARDIAN", "Balasan wali"),
];

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.startsWith("/api/auth/me")) return Promise.resolve({ ok: true, json: async () => ({ id: "u-me", role: "TEACHER" }) });
    if (u.includes("/week")) return Promise.resolve({ ok: true, json: async () => week });
    if (u.startsWith("/api/student-journal/notes/read")) return Promise.resolve({ ok: true, json: async () => ({}) });
    if (u.startsWith("/api/student-journal/notes/mine") && init?.method === "DELETE") return Promise.resolve({ ok: true, json: async () => ({ data: { id: "mine" } }) });
    if (u.startsWith("/api/student-journal/notes?")) return Promise.resolve({ ok: true, json: async () => ({ data: { notes: thread, nextCursor: null, unreadCount: 0 } }) });
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
  vi.stubGlobal("fetch", fetchMock);
});

describe("teacher can edit and delete only her own catatan (X-4)", () => {
  it("shows the controls on her own note and on nobody else's", async () => {
    render(<TeacherStudentWeekPage />);
    await screen.findByText("Catatan saya");
    await screen.findByText("Balasan wali");
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Edit catatan" })).toHaveLength(1));
    expect(screen.getAllByRole("button", { name: "Hapus catatan" })).toHaveLength(1);
  });

  it("confirms before deleting, then deletes and reloads the thread", async () => {
    render(<TeacherStudentWeekPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Hapus catatan" }));
    expect(await screen.findByText("Hapus catatan ini?")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);

    const before = fetchMock.mock.calls.filter(([u]) => String(u).startsWith("/api/student-journal/notes?")).length;
    fireEvent.click(screen.getByRole("button", { name: "Hapus" }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u, init]) => String(u) === "/api/student-journal/notes/mine" && init?.method === "DELETE")).toBe(true),
    );
    await waitFor(() =>
      expect(fetchMock.mock.calls.filter(([u]) => String(u).startsWith("/api/student-journal/notes?")).length).toBeGreaterThan(before),
    );
  });

  it("opens the composer prefilled with the note when she taps edit", async () => {
    render(<TeacherStudentWeekPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit catatan" }));
    const dialog = await screen.findByRole("dialog", { name: /Ubah catatan/ });
    expect(within(dialog).getByLabelText("Isi catatan")).toHaveValue("Catatan saya");
  });
});
