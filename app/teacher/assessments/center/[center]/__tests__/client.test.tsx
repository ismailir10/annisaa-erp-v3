import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { CenterSessionClient } from "../client";

const session = (writable = true) => ({
  week: { id: "week-1", number: 3, subTheme: { name: "Aku" }, theme: { name: "Diriku" } },
  center: "WORSHIP",
  date: "2026-08-03",
  ageGroup: "A",
  students: [{ id: "student-1", name: "Aisyah", nickname: null, status: "ACTIVE" }],
  indicators: [{ id: "indicator-1", content: "Mengikuti kegiatan", order: 1, objective: { id: "objective-1", ageGroup: "A", element: "Karakter" } }],
  entries: [],
  lastActivity: null,
  writable,
});

const ok = (body: unknown) => ({ ok: true, json: async () => body });

function renderClient() {
  return render(<CenterSessionClient center="WORSHIP" centerLabel="Sentra Ibadah" />);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

describe("CenterSessionClient", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    refresh.mockClear();
  });

  it("uses keyboard-operable native age-group radios with 44px focus targets", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok(session())));
    renderClient();
    const group = await screen.findByRole("radiogroup", { name: "Kelompok usia" });
    const a = within(group).getByRole("radio", { name: "TK A" });
    const b = within(group).getByRole("radio", { name: "TK B" });
    expect(a).toBeChecked();
    expect(a.closest("label")).toHaveClass("min-h-11");
    expect(a.closest("label")).toHaveClass("has-[input:focus-visible]:ring-2");
    a.focus();
    await user.keyboard("{ArrowRight}");
    expect(b).toBeChecked();
    expect(b).toHaveFocus();
  });

  it("shows retryable load failure instead of the legitimate empty state, then recovers", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(() => ++calls === 1 ? Promise.reject(new Error("offline")) : Promise.resolve(ok(session()))));
    renderClient();
    await screen.findByRole("alert");
    expect(screen.getByText("Tidak bisa memuat sentra")).toBeInTheDocument();
    expect(screen.queryByTestId("center-indicator-picker")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Coba lagi" }));
    await waitFor(() => expect(screen.getByTestId("center-indicator-picker")).toBeInTheDocument());
  });

  it("ignores a stale earlier load after the date changes", async () => {
    const first = deferred<ReturnType<typeof ok>>();
    const second = deferred<ReturnType<typeof ok>>();
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(() => ++calls === 1 ? first.promise : second.promise));
    renderClient();
    // Derive the "other" date from the picker's current value rather than
    // hardcoding one. The input defaults to today, so a literal stops forcing a
    // refetch the day the clock reaches it — the previous "2026-08-04" went
    // red on 2026-08-04 and stayed red.
    const dateInput = screen.getByTestId("center-date") as HTMLInputElement;
    const otherDay = new Date(`${dateInput.value}T00:00:00Z`);
    otherDay.setUTCDate(otherDay.getUTCDate() - 1);
    fireEvent.change(dateInput, {
      target: { value: otherDay.toISOString().slice(0, 10) },
    });
    await waitFor(() => expect(calls).toBe(2));
    second.resolve(ok({ ...session(), indicators: [{ ...session().indicators[0], id: "indicator-new", content: "Data baru" }] }));
    await screen.findByText("Data baru");
    await act(async () => { first.resolve(ok({ ...session(), indicators: [{ ...session().indicators[0], content: "Data lama" }] })); });
    expect(screen.queryByText("Data lama")).toBeNull();
    expect(screen.getByText("Data baru")).toBeInTheDocument();
  });

  it("shows a safe-area save footer only for writable payloads", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok(session(true))));
    const writable = renderClient();
    const save = await screen.findByTestId("center-save");
    expect(save.parentElement?.className).toContain("bottom-[calc(4rem+env(safe-area-inset-bottom))]");
    expect(save.parentElement?.className).toContain("bg-background/95");
    writable.unmount();

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok({
      ...session(false),
      entries: [{
        id: "entry-1",
        studentId: "student-1",
        indicatorId: "indicator-1",
        level: "CONSISTENT",
        note: "Sudah dicatat",
        activity: "Doa pagi",
      }],
    })));
    renderClient();
    await screen.findByTestId("center-indicator-picker");
    expect(screen.queryByTestId("center-save")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Sesi ini hanya-baca");
    expect(screen.getByTestId("center-date")).toBeDisabled();
    expect(screen.getByTestId("center-activity")).toBeDisabled();
    expect(screen.getByRole("radio", { name: "TK A" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Karakter.*Mengikuti kegiatan/ })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Mampu" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Catatan" })).toBeDisabled();
    expect(screen.getByText("Catatan: Sudah dicatat")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Catatan singkat (opsional)")).toBeNull();
  });
});
