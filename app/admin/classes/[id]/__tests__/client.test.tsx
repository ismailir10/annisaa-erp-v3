/**
 * T7 — override-confirm UI for the class-detail add-student door.
 *
 * The server (app/api/admin/classes/[id]/enrollments/route.ts) is
 * advisory-only for age: a 409 AGE_OUT_OF_RANGE can be overridden by
 * resubmitting with a non-empty `ageOverrideReason`; a 409 ALREADY_ENROLLED
 * cannot be overridden at all. These tests drive the real
 * `submitAddStudent` + dialog rendering in
 * app/admin/classes/[id]/client.tsx against a stubbed fetch to prove the
 * confirm step behaves per the cycle doc's Task T7 acceptance criteria.
 *
 * `@/components/ui/select` (Base UI) is mocked to plain, always-rendered
 * elements — same precedent as
 * app/teacher/class-attendance/__tests__/page.test.tsx — so these tests
 * exercise the real state machine (submitAddStudent, the confirm-step
 * render, focus, disabled gating) without fighting Base UI's
 * open/close/positioning internals, which are unrelated to T7.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";

import { ClassDetailClient } from "@/app/admin/classes/[id]/client";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/components/ui/select", () => {
  const SelectCtx = React.createContext<{ onValueChange?: (v: string) => void }>({});

  function Select({
    onValueChange,
    children,
  }: {
    value?: string;
    onValueChange?: (v: string) => void;
    children: React.ReactNode;
  }) {
    return <SelectCtx.Provider value={{ onValueChange }}>{children}</SelectCtx.Provider>;
  }
  function SelectTrigger({ children, ...props }: React.ComponentProps<"button">) {
    return (
      <button type="button" {...props}>
        {children}
      </button>
    );
  }
  function SelectValue({ placeholder }: { placeholder?: string }) {
    return <span>{placeholder ?? null}</span>;
  }
  function SelectContent({ children }: { children: React.ReactNode }) {
    return <div>{children}</div>;
  }
  function SelectItem({
    value,
    children,
    disabled,
  }: {
    value: string;
    children: React.ReactNode;
    disabled?: boolean;
  }) {
    const ctx = React.useContext(SelectCtx);
    return (
      <div
        role="option"
        aria-selected={false}
        aria-disabled={disabled}
        onClick={() => {
          if (!disabled) ctx.onValueChange?.(value);
        }}
      >
        {children}
      </div>
    );
  }
  return { Select, SelectTrigger, SelectValue, SelectContent, SelectItem };
});

const classDetail = {
  id: "class-1",
  name: "KB 1",
  capacity: 20,
  slotTemplate: "FULL_DAY",
  status: "ACTIVE",
  campusId: "campus-1",
  programId: "program-1",
  academicYearId: "ay-1",
  classTrackId: "track-1",
  campus: { id: "campus-1", name: "Kampus A" },
  program: { id: "program-1", code: "KB", name: "Kelompok Bermain" },
  academicYear: { id: "ay-1", name: "2025/2026", status: "ACTIVE" as const },
  classTrack: { id: "track-1", name: "Reguler", status: "ACTIVE" },
  enrollments: [],
  teachingAssignments: [],
  enrolledCount: 0,
};

const students = [
  { id: "stu-1", name: "Bilal Ahmad", nis: "2025001", status: "ACTIVE" },
  { id: "stu-2", name: "Zahra Amalia", nis: "2025002", status: "ACTIVE" },
];

const AGE_MESSAGE =
  "Usia anak 2 tahun 6 bulan (30 bulan) di bawah batas usia minimum program Kelompok Bermain (36–48 bulan), per awal tahun ajaran 14 Juli 2025.";
const ALREADY_ENROLLED_MESSAGE =
  "Siswa sudah terdaftar di kelas TKIT A pada tahun ajaran ini.";

type EnrollResponse = { status: number; body: Record<string, unknown> };

function stubFetch(enrollResponses: EnrollResponse[]) {
  let call = 0;
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";

    if (url.includes("/api/admin/classes/class-1/enrollments") && method === "POST") {
      const resp = enrollResponses[Math.min(call, enrollResponses.length - 1)];
      call += 1;
      return Promise.resolve({
        ok: resp.status < 300,
        status: resp.status,
        json: async () => resp.body,
      } as Response);
    }
    if (url.includes("/api/students?status=ACTIVE")) {
      return Promise.resolve({ ok: true, json: async () => ({ data: students }) } as Response);
    }
    if (url === "/api/admin/classes/class-1") {
      return Promise.resolve({ ok: true, json: async () => classDetail } as Response);
    }
    return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
  });
}

async function openAddStudentAndPick(user: ReturnType<typeof userEvent.setup>, studentName: string) {
  await user.click(await screen.findByRole("button", { name: "Tambah Siswa" }));
  await screen.findByLabelText(/^Siswa\*?$/);
  await user.click(screen.getByRole("option", { name: new RegExp(studentName) }));
}

describe("ClassDetailClient — add-student override-confirm (T7)", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("AGE_OUT_OF_RANGE: warn → enter reason → success", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      stubFetch([
        { status: 409, body: { error: AGE_MESSAGE, code: "AGE_OUT_OF_RANGE", ageMonths: 30, ageMin: 36, ageMax: 48 } },
        { status: 201, body: { id: "enr-1" } },
      ]),
    );
    render(<ClassDetailClient classId="class-1" canWrite />);

    await openAddStudentAndPick(user, "Bilal Ahmad");
    await user.click(screen.getByRole("button", { name: "Tambahkan" }));

    const banner = await screen.findByText(AGE_MESSAGE);
    expect(banner).toBeInTheDocument();

    const confirmBtn = screen.getByRole("button", { name: "Tetap Tambahkan" });
    expect(confirmBtn).toBeDisabled();

    await waitFor(() => {
      expect(document.activeElement).toHaveAttribute("role", "alert");
    });

    const reasonField = screen.getByLabelText(/^Alasan\*?$/);
    await user.type(reasonField, "Penempatan sesuai kemampuan anak");
    expect(confirmBtn).not.toBeDisabled();

    await user.click(confirmBtn);

    const { toast } = await import("sonner");
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Siswa ditambahkan"));
    await waitFor(() => expect(screen.queryByText(AGE_MESSAGE)).not.toBeInTheDocument());
  });

  it("AGE_OUT_OF_RANGE: warn → cancel returns to the picker with a cleared reason", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      stubFetch([{ status: 409, body: { error: AGE_MESSAGE, code: "AGE_OUT_OF_RANGE", ageMonths: 30, ageMin: 36, ageMax: 48 } }]),
    );
    render(<ClassDetailClient classId="class-1" canWrite />);

    await openAddStudentAndPick(user, "Bilal Ahmad");
    await user.click(screen.getByRole("button", { name: "Tambahkan" }));
    await screen.findByText(AGE_MESSAGE);
    await user.type(screen.getByLabelText(/^Alasan\*?$/), "some reason");

    await user.click(screen.getByRole("button", { name: "Batal" }));

    expect(screen.queryByText(AGE_MESSAGE)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Alasan\*?$/)).not.toBeInTheDocument();
    expect(await screen.findByLabelText(/^Siswa\*?$/)).toBeInTheDocument();
  });

  it("keeps the confirm button disabled for a whitespace-only reason", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      stubFetch([{ status: 409, body: { error: AGE_MESSAGE, code: "AGE_OUT_OF_RANGE", ageMonths: 30, ageMin: 36, ageMax: 48 } }]),
    );
    render(<ClassDetailClient classId="class-1" canWrite />);

    await openAddStudentAndPick(user, "Bilal Ahmad");
    await user.click(screen.getByRole("button", { name: "Tambahkan" }));
    await screen.findByText(AGE_MESSAGE);

    const confirmBtn = screen.getByRole("button", { name: "Tetap Tambahkan" });
    expect(confirmBtn).toBeDisabled();

    await user.type(screen.getByLabelText(/^Alasan\*?$/), "   ");
    expect(confirmBtn).toBeDisabled();
  });

  it("ALREADY_ENROLLED: shows the conflicting class with no override affordance", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      stubFetch([{ status: 409, body: { error: ALREADY_ENROLLED_MESSAGE, code: "ALREADY_ENROLLED", existingClassSectionId: "sec-tk" } }]),
    );
    render(<ClassDetailClient classId="class-1" canWrite />);

    await openAddStudentAndPick(user, "Bilal Ahmad");
    await user.click(screen.getByRole("button", { name: "Tambahkan" }));

    await screen.findByText(ALREADY_ENROLLED_MESSAGE);
    expect(screen.queryByLabelText(/^Alasan\*?$/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tetap Tambahkan" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pilih Siswa Lain" })).toBeInTheDocument();
  });

  it("resets the override state when the dialog is closed and reopened", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      stubFetch([{ status: 409, body: { error: AGE_MESSAGE, code: "AGE_OUT_OF_RANGE", ageMonths: 30, ageMin: 36, ageMax: 48 } }]),
    );
    render(<ClassDetailClient classId="class-1" canWrite />);

    await openAddStudentAndPick(user, "Bilal Ahmad");
    await user.click(screen.getByRole("button", { name: "Tambahkan" }));
    await screen.findByText(AGE_MESSAGE);
    await user.type(screen.getByLabelText(/^Alasan\*?$/), "some reason");

    // Escape closes the Dialog (Base UI's default dismissible behaviour).
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByText(AGE_MESSAGE)).not.toBeInTheDocument());

    // Reopen — the confirm step must not survive; the picker is fresh.
    await user.click(await screen.findByRole("button", { name: "Tambah Siswa" }));
    expect(await screen.findByLabelText(/^Siswa\*?$/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Alasan\*?$/)).not.toBeInTheDocument();
    expect(screen.queryByText(AGE_MESSAGE)).not.toBeInTheDocument();
  });
});
