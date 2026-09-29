import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RaportEditor } from "../raport-editor";
import { BUCKETED_SECTIONS } from "@/lib/raport/labels";
import { toast } from "sonner";
import { UnsavedChangesProvider } from "@/components/admin/unsaved-changes-provider";
import { GuardedLink } from "@/components/admin/guarded-link";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const routerPush = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
}));

type SavedPayload = {
  sectionLevels: Record<string, string>;
  sectionNarratives: Record<string, string>;
  permittedAbsenceDays: number;
  sickDays: number;
  unexcusedAbsenceDays: number;
  totalSchoolDays: number;
  memorizationNotes: string | null;
  status: string;
  publishedAt: string | null;
} | null;

function payload(saved: SavedPayload = null) {
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
      saved,
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

function publishedPayload() {
  return payload({
    sectionLevels: {},
    sectionNarratives: {},
    permittedAbsenceDays: 0,
    sickDays: 0,
    unexcusedAbsenceDays: 0,
    totalSchoolDays: 0,
    memorizationNotes: null,
    status: "PUBLISHED",
    publishedAt: "2026-01-01",
  });
}

function stubFetchPublished() {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, json: async () => publishedPayload() })
    .mockResolvedValue({ ok: true, json: async () => ({}) });
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
    render(<RaportEditor studentId="stu-1" termId="term-1" onBack={onBack} />);

    await screen.findByText("Rapor — Aisyah Nuraini");
    // This assertion exercises a synchronous navigation handler. Using
    // userEvent's full pointer sequence here needlessly makes the first test
    // in this render-heavy suite compete for timers under full-suite load.
    fireEvent.click(screen.getByRole("button", { name: /Kembali ke daftar/ }));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Keluar tanpa menyimpan?")).not.toBeInTheDocument();
  });

  it("blocks back navigation and shows the confirmation after an edit", async () => {
    stubFetchOnce();
    const onBack = vi.fn();
    const user = userEvent.setup();
    render(<RaportEditor studentId="stu-1" termId="term-1" onBack={onBack} />);

    await screen.findByText("Rapor — Aisyah Nuraini");
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

    await screen.findByText("Rapor — Aisyah Nuraini");
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

    await screen.findByText("Rapor — Aisyah Nuraini");
    await user.type(screen.getByLabelText("Hafalan (surah / hadis / doa)"), "An-Naba ayat 1-5");
    await user.click(screen.getByRole("button", { name: /Kembali ke daftar/ }));
    await screen.findByText("Keluar tanpa menyimpan?");

    await user.click(screen.getByRole("button", { name: "Batal" }));

    await waitFor(() => {
      expect(screen.queryByText("Keluar tanpa menyimpan?")).not.toBeInTheDocument();
    });
    expect(onBack).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Hafalan (surah / hadis / doa)")).toHaveValue("An-Naba ayat 1-5");
  });

  it("blocks back navigation after editing a narrative textarea", async () => {
    stubFetchOnce();
    const onBack = vi.fn();
    const user = userEvent.setup();
    render(<RaportEditor studentId="stu-1" termId="term-1" onBack={onBack} />);

    await screen.findByText("Rapor — Aisyah Nuraini");
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

    await screen.findByText("Rapor — Aisyah Nuraini");
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

    await screen.findByText("Rapor — Aisyah Nuraini");
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

    await screen.findByText("Rapor — Aisyah Nuraini");
    await user.type(screen.getByLabelText("Hafalan (surah / hadis / doa)"), "An-Naba ayat 1-5");

    await user.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Rapor disimpan."));

    await user.click(screen.getByRole("button", { name: /Kembali ke daftar/ }));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Keluar tanpa menyimpan?")).not.toBeInTheDocument();
  });

  it("stays clean when an edit is typed then reverted to its original value", async () => {
    stubFetchOnce();
    const onBack = vi.fn();
    const user = userEvent.setup();
    render(<RaportEditor studentId="stu-1" termId="term-1" onBack={onBack} />);

    await screen.findByText("Rapor — Aisyah Nuraini");
    const hafalanField = screen.getByLabelText("Hafalan (surah / hadis / doa)");
    await user.type(hafalanField, "An-Naba ayat 1-5");
    await user.clear(hafalanField);

    await user.click(screen.getByRole("button", { name: /Kembali ke daftar/ }));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Keluar tanpa menyimpan?")).not.toBeInTheDocument();
  });
});

describe("RaportEditor attendance validation (ACAD-1)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("blocks save and marks Sakit invalid when it exceeds Hari sekolah", async () => {
    const fetchMock = stubFetchOnce();
    const user = userEvent.setup();
    render(<RaportEditor studentId="stu-1" termId="term-1" onBack={vi.fn()} />);

    await screen.findByText("Rapor — Aisyah Nuraini");
    const total = screen.getByLabelText(/^Hari sekolah/);
    await user.clear(total);
    await user.type(total, "4");
    const sick = screen.getByLabelText(/^Sakit/);
    await user.clear(sick);
    await user.type(sick, "10");

    await user.click(screen.getByRole("button", { name: "Simpan" }));

    expect(await screen.findByText("Sakit (10) tidak boleh melebihi hari sekolah (4)")).toBeInTheDocument();
    expect(sick).toHaveAttribute("aria-invalid", "true");
    expect(toast.error).toHaveBeenCalledWith("Periksa kolom kehadiran yang ditandai.");
    // Only the initial GET — the PUT never went out.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("clears the message once the count is edited and saves when valid", async () => {
    stubFetchOnce();
    const user = userEvent.setup();
    render(<RaportEditor studentId="stu-1" termId="term-1" onBack={vi.fn()} />);

    await screen.findByText("Rapor — Aisyah Nuraini");
    await user.clear(screen.getByLabelText(/^Hari sekolah/));
    await user.type(screen.getByLabelText(/^Hari sekolah/), "4");
    const sick = screen.getByLabelText(/^Sakit/);
    await user.clear(sick);
    await user.type(sick, "10");
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    await screen.findByText("Sakit (10) tidak boleh melebihi hari sekolah (4)");

    await user.clear(sick);
    await user.type(sick, "3");
    expect(screen.queryByText(/tidak boleh melebihi hari sekolah/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Rapor disimpan."));
  });
});

describe("RaportEditor unpublish confirm", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("shows the confirmation and keeps the rapor published when cancelled", async () => {
    stubFetchPublished();
    const user = userEvent.setup();
    render(<RaportEditor studentId="stu-1" termId="term-1" onBack={vi.fn()} />);

    await screen.findByText("Rapor — Aisyah Nuraini");
    await user.click(screen.getByRole("button", { name: "Tarik penerbitan" }));
    expect(await screen.findByText("Tarik penerbitan rapor?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Batal" }));

    await waitFor(() => {
      expect(screen.queryByText("Tarik penerbitan rapor?")).not.toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Tarik penerbitan" })).toBeInTheDocument();
  });

  it("confirms and pulls the rapor back to draft", async () => {
    stubFetchPublished();
    const user = userEvent.setup();
    render(<RaportEditor studentId="stu-1" termId="term-1" onBack={vi.fn()} />);

    await screen.findByText("Rapor — Aisyah Nuraini");
    await user.click(screen.getByRole("button", { name: "Tarik penerbitan" }));
    await screen.findByText("Tarik penerbitan rapor?");

    await user.click(screen.getByRole("button", { name: "Ya, Tarik" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Penerbitan ditarik."));
    expect(await screen.findByRole("button", { name: "Simpan & Terbitkan" })).toBeInTheDocument();
  });
});

describe("RaportEditor app-shell unsaved-changes guard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // Simulates the admin app shell (app/admin/layout.tsx mounts
  // UnsavedChangesProvider once; sidebar/breadcrumb links render as
  // GuardedLink). Proves the editor's dirty flag is wired into
  // useUnsavedChangesGuard so an app-shell navigation click is intercepted —
  // not just the editor's own in-editor "Kembali ke daftar" back guard,
  // which is covered separately above.
  it("registers the guard once dirty, so an app-shell link click opens the shared confirm dialog instead of navigating", async () => {
    stubFetchOnce();
    const user = userEvent.setup();
    render(
      <UnsavedChangesProvider>
        <GuardedLink href="/admin/report-cards">Rapor</GuardedLink>
        <RaportEditor studentId="stu-1" termId="term-1" onBack={vi.fn()} />
      </UnsavedChangesProvider>,
    );

    await screen.findByText("Rapor — Aisyah Nuraini");

    // Not dirty yet — the sidebar-style link is unguarded.
    fireEvent.click(screen.getByRole("link", { name: "Rapor" }));
    expect(screen.queryByText("Keluar tanpa menyimpan?")).not.toBeInTheDocument();
    expect(routerPush).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Hafalan (surah / hadis / doa)"), "An-Naba ayat 1-5");

    await user.click(screen.getByRole("link", { name: "Rapor" }));
    expect(await screen.findByText("Keluar tanpa menyimpan?")).toBeInTheDocument();
    expect(routerPush).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Ya, Keluar" }));
    expect(routerPush).toHaveBeenCalledExactlyOnceWith("/admin/report-cards");
  });
});
