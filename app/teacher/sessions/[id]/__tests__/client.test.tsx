import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const toastError = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());

vi.mock("sonner", () => ({
  toast: { error: toastError, success: toastSuccess },
}));

import { SessionRosterClient, type RosterRow } from "../client";

const roster: RosterRow[] = [
  {
    studentId: "s1",
    name: "Aisyah",
    nickname: null,
    status: "PRESENT",
    checkInTime: null,
    checkOutTime: null,
    pickedUpByRelation: null,
    pickedUpByName: null,
  },
  {
    studentId: "s2",
    name: "Bilal",
    nickname: "Bilal",
    status: "PRESENT",
    checkInTime: null,
    checkOutTime: null,
    pickedUpByRelation: null,
    pickedUpByName: null,
  },
];

function renderRoster(rows = roster) {
  return render(
    <SessionRosterClient
      sessionId="session_1"
      className="TK A"
      date="2026-08-03"
      slot="MORNING"
      roster={rows}
    />,
  );
}

describe("SessionRosterClient", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    toastError.mockClear();
    toastSuccess.mockClear();
  });

  it("keeps the save action clear of the navigation safe area and names its batch", () => {
    renderRoster();

    const save = screen.getByRole("button", { name: "Simpan absensi · 2 siswa" });
    const saveArea = save.parentElement;
    expect(saveArea?.className).toContain("bottom-[calc(4rem+env(safe-area-inset-bottom))]");
    expect(saveArea?.className).toContain("bg-background");
    expect(saveArea?.className).toContain("border-t");

    const status = screen.getByRole("button", {
      name: "Ubah status Aisyah, saat ini Hadir. Ketuk untuk mengubah status.",
    });
    expect(status.className).toContain("min-h-11");
    expect(status.className).toContain("min-w-11");
    expect(status.className).toContain("focus-visible:ring-2");
  });

  it("saves the cycled status with the full roster payload", async () => {
    let resolveSave!: (value: { ok: boolean; json: () => Promise<unknown> }) => void;
    const save = new Promise<{ ok: boolean; json: () => Promise<unknown> }>((resolve) => {
      resolveSave = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(save);
    vi.stubGlobal("fetch", fetchMock);
    renderRoster();

    fireEvent.click(screen.getByRole("button", { name: /Ubah status Aisyah/ }));
    fireEvent.click(screen.getByRole("button", { name: "Simpan absensi · 2 siswa" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/teacher/sessions/session_1/attendance",
      expect.objectContaining({ method: "POST" }),
    );
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(request.body as string)).toEqual({
      rows: [
        expect.objectContaining({ studentId: "s1", status: "ABSENT" }),
        expect.objectContaining({ studentId: "s2", status: "PRESENT" }),
      ],
    });
    expect(screen.getByRole("button", { name: "Menyimpan absensi…" })).toBeDisabled();

    resolveSave({ ok: true, json: async () => ({ saved: 2, total: 2 }) });
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Absensi tersimpan · 2 siswa"));
  });

  it("keeps validation local when another pickup relation requires a name", () => {
    vi.stubGlobal("fetch", vi.fn());
    renderRoster([
      {
        ...roster[0],
        checkOutTime: "2026-08-03T08:00:00.000Z",
        pickedUpByRelation: "OTHER",
        pickedUpByName: "",
      },
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Simpan absensi · 1 siswa" }));
    expect(toastError).toHaveBeenCalledWith(
      "Isi nama penjemput untuk Aisyah (hubungan: Lainnya).",
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
