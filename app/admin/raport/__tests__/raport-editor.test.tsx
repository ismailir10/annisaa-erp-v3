import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RaportEditor } from "../raport-editor";
import { BUCKETED_SECTIONS } from "@/lib/raport/labels";
import { toast } from "sonner";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function payload() {
  const sections: Record<string, { suggested: null; counts: Record<string, number> }> = {};
  for (const s of BUCKETED_SECTIONS) {
    sections[s] = {
      suggested: null,
      counts: { CONSISTENT: 0, EMERGING: 0, NEEDS_REINFORCEMENT: 0, total: 0 },
    };
  }
  return {
    data: {
      student: { id: "stu-1", name: "Aisyah Nuraini", nickname: "Aisyah" },
      term: { id: "term-1", number: 1, semesterNumber: 1, academicYear: "2026/2027" },
      ageGroup: null,
      templates: null,
      saved: null,
      measurement: null,
      draft: {
        sections,
        attendance: { permittedAbsenceDays: 0, sickDays: 0, unexcusedAbsenceDays: 0, totalSchoolDays: 0 },
      },
    },
  };
}

function stubFetchOnce() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => payload(),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("RaportEditor unsaved-changes guard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("calls onBack immediately when there are no edits", async () => {
    stubFetchOnce();
    const onBack = vi.fn();
    const user = userEvent.setup();
    render(<RaportEditor studentId="stu-1" termId="term-1" onBack={onBack} />);

    await screen.findByText("Raport — Aisyah Nuraini");
    await user.click(screen.getByRole("button", { name: /Kembali ke daftar/ }));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Keluar tanpa menyimpan?")).not.toBeInTheDocument();
  });

  it("blocks back navigation and shows the confirmation after an edit", async () => {
    stubFetchOnce();
    const onBack = vi.fn();
    const user = userEvent.setup();
    render(<RaportEditor studentId="stu-1" termId="term-1" onBack={onBack} />);

    await screen.findByText("Raport — Aisyah Nuraini");
    await user.type(screen.getByLabelText("Hafalan (surah / hadis / doa)"), "An-Naba ayat 1-5");

    await user.click(screen.getByRole("button", { name: /Kembali ke daftar/ }));

    expect(onBack).not.toHaveBeenCalled();
    expect(await screen.findByText("Keluar tanpa menyimpan?")).toBeInTheDocument();
  });

  it("discards edits and calls onBack when the admin confirms leaving", async () => {
    stubFetchOnce();
    const onBack = vi.fn();
    const user = userEvent.setup();
    render(<RaportEditor studentId="stu-1" termId="term-1" onBack={onBack} />);

    await screen.findByText("Raport — Aisyah Nuraini");
    await user.type(screen.getByLabelText("Hafalan (surah / hadis / doa)"), "An-Naba ayat 1-5");
    await user.click(screen.getByRole("button", { name: /Kembali ke daftar/ }));
    await screen.findByText("Keluar tanpa menyimpan?");

    await user.click(screen.getByRole("button", { name: "Ya, Keluar" }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("keeps the editor open when the admin cancels leaving", async () => {
    stubFetchOnce();
    const onBack = vi.fn();
    const user = userEvent.setup();
    render(<RaportEditor studentId="stu-1" termId="term-1" onBack={onBack} />);

    await screen.findByText("Raport — Aisyah Nuraini");
    await user.type(screen.getByLabelText("Hafalan (surah / hadis / doa)"), "An-Naba ayat 1-5");
    await user.click(screen.getByRole("button", { name: /Kembali ke daftar/ }));
    await screen.findByText("Keluar tanpa menyimpan?");

    await user.click(screen.getByRole("button", { name: "Batal" }));

    expect(onBack).not.toHaveBeenCalled();
    expect(screen.queryByText("Keluar tanpa menyimpan?")).not.toBeInTheDocument();
  });

  it("blocks back navigation after editing a narrative textarea", async () => {
    stubFetchOnce();
    const onBack = vi.fn();
    const user = userEvent.setup();
    render(<RaportEditor studentId="stu-1" termId="term-1" onBack={onBack} />);

    await screen.findByText("Raport — Aisyah Nuraini");
    await user.type(screen.getByLabelText("Pembukaan"), "Ananda menunjukkan semangat belajar.");

    await user.click(screen.getByRole("button", { name: /Kembali ke daftar/ }));

    expect(onBack).not.toHaveBeenCalled();
    expect(await screen.findByText("Keluar tanpa menyimpan?")).toBeInTheDocument();
  });

  it("blocks back navigation after changing a capaian level", async () => {
    stubFetchOnce();
    const onBack = vi.fn();
    const user = userEvent.setup();
    render(<RaportEditor studentId="stu-1" termId="term-1" onBack={onBack} />);

    await screen.findByText("Raport — Aisyah Nuraini");
    await user.selectOptions(
      screen.getByLabelText("Capaian Nilai Agama & Budi Pekerti"),
      "Mampu dan Konsisten",
    );

    await user.click(screen.getByRole("button", { name: /Kembali ke daftar/ }));

    expect(onBack).not.toHaveBeenCalled();
    expect(await screen.findByText("Keluar tanpa menyimpan?")).toBeInTheDocument();
  });

  it("blocks back navigation after editing an attendance count", async () => {
    stubFetchOnce();
    const onBack = vi.fn();
    const user = userEvent.setup();
    render(<RaportEditor studentId="stu-1" termId="term-1" onBack={onBack} />);

    await screen.findByText("Raport — Aisyah Nuraini");
    const sickField = screen.getByLabelText(/^Sakit/);
    await user.clear(sickField);
    await user.type(sickField, "2");

    await user.click(screen.getByRole("button", { name: /Kembali ke daftar/ }));

    expect(onBack).not.toHaveBeenCalled();
    expect(await screen.findByText("Keluar tanpa menyimpan?")).toBeInTheDocument();
  });

  it("re-baselines after a successful save so back navigates without confirmation", async () => {
    stubFetchOnce();
    const onBack = vi.fn();
    const user = userEvent.setup();
    render(<RaportEditor studentId="stu-1" termId="term-1" onBack={onBack} />);

    await screen.findByText("Raport — Aisyah Nuraini");
    await user.type(screen.getByLabelText("Hafalan (surah / hadis / doa)"), "An-Naba ayat 1-5");

    await user.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Raport disimpan."));

    await user.click(screen.getByRole("button", { name: /Kembali ke daftar/ }));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Keluar tanpa menyimpan?")).not.toBeInTheDocument();
  });

  it("stays clean when an edit is typed then reverted to its original value", async () => {
    stubFetchOnce();
    const onBack = vi.fn();
    const user = userEvent.setup();
    render(<RaportEditor studentId="stu-1" termId="term-1" onBack={onBack} />);

    await screen.findByText("Raport — Aisyah Nuraini");
    const hafalanField = screen.getByLabelText("Hafalan (surah / hadis / doa)");
    await user.type(hafalanField, "An-Naba ayat 1-5");
    await user.clear(hafalanField);

    await user.click(screen.getByRole("button", { name: /Kembali ke daftar/ }));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Keluar tanpa menyimpan?")).not.toBeInTheDocument();
  });
});
