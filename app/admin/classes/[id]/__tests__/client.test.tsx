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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

// ── Teacher-swap dialog (T6) ────────────────────────────────────────

const today = new Date();
const sessionDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-15`;

const sessionRow = {
  id: "sess-1",
  classSectionId: "class-1",
  semesterId: "sem-1",
  date: sessionDate,
  slot: "FULL_DAY",
  teacherId: "emp-1",
  defaultTeacherId: "emp-1",
  substituteReason: null,
  isBackfilled: false,
  teacher: { id: "emp-1", nama: "Ustadz Bilal" },
  defaultTeacher: { id: "emp-1", nama: "Ustadz Bilal" },
};

function stubFetchWithSession({ archived = false }: { archived?: boolean } = {}) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";

    if (url.startsWith("/api/admin/class-sessions/") && method === "PATCH") {
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
    }
    if (url.includes("/api/admin/class-sessions?")) {
      return Promise.resolve({ ok: true, json: async () => [sessionRow] } as Response);
    }
    if (url.includes("/api/employees?status=ACTIVE")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          data: [{ id: "emp-2", nama: "Ustadzah Fatimah", formalName: null }],
          total: 1,
        }),
      } as Response);
    }
    if (url === "/api/admin/classes/class-1") {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          ...classDetail,
          academicYear: {
            ...classDetail.academicYear,
            status: archived ? "ARCHIVED" : "ACTIVE",
          },
        }),
      } as Response);
    }
    return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
  });
}

async function openSessionDialog(user: ReturnType<typeof userEvent.setup>) {
  // "Sehari Penuh" also appears in the Ringkasan rail's slot-template row, so
  // key off the session chip's teacher name (unique to the calendar) instead.
  const trigger = (await screen.findByText("Ustadz Bilal")).closest("button");
  if (!trigger) throw new Error("session button not found");
  await user.click(trigger);
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
    fireEvent.change(reasonField, { target: { value: "Penempatan sesuai kemampuan anak" } });
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
    fireEvent.change(screen.getByLabelText(/^Alasan\*?$/), { target: { value: "some reason" } });

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

    fireEvent.change(screen.getByLabelText(/^Alasan\*?$/), { target: { value: "   " } });
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

  // T3 (cycle 2026-09-27, admin-forms-rhf) — the picker step now validates
  // `studentId` via useZodForm(enrollmentAddSchema) + FormField instead of
  // the old `if (!selectedStudentId) toast.error(...)` check.
  it("blocks submit with no student selected, showing an inline error and firing no POST", async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch([]);
    vi.stubGlobal("fetch", fetchMock);
    render(<ClassDetailClient classId="class-1" canWrite />);

    await user.click(await screen.findByRole("button", { name: "Tambah Siswa" }));
    await screen.findByLabelText(/^Siswa\*?$/);
    await user.click(screen.getByRole("button", { name: "Tambahkan" }));

    expect(await screen.findByText("Siswa wajib dipilih")).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        const url = typeof input === "string" ? input : input.toString();
        return url.includes("/enrollments") && init?.method === "POST";
      }),
    ).toBe(false);
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
    fireEvent.change(screen.getByLabelText(/^Alasan\*?$/), { target: { value: "some reason" } });

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

// T3 (cycle 2026-09-27, admin-forms-rhf) — Tambah Guru migrated onto
// useZodForm(teachingAssignmentAddSchema) + FormField.
function stubFetchForAddTeacher(teachingAssignmentResponse: { status: number; body: Record<string, unknown> }) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";

    if (url.includes("/api/admin/classes/class-1/teaching-assignments") && method === "POST") {
      return Promise.resolve({
        ok: teachingAssignmentResponse.status < 300,
        status: teachingAssignmentResponse.status,
        json: async () => teachingAssignmentResponse.body,
      } as Response);
    }
    if (url.includes("/api/employees?status=ACTIVE")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ data: [{ id: "emp-2", nama: "Ustadzah Fatimah", formalName: null }], total: 1 }),
      } as Response);
    }
    if (url === "/api/admin/classes/class-1") {
      return Promise.resolve({ ok: true, json: async () => classDetail } as Response);
    }
    return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
  });
}

describe("ClassDetailClient — Tambah Guru dialog (T3 rhf migration)", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("blocks submit with no guru selected, showing an inline error and firing no POST", async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetchForAddTeacher({ status: 201, body: { id: "ta-1" } });
    vi.stubGlobal("fetch", fetchMock);
    render(<ClassDetailClient classId="class-1" canWrite />);

    await user.click(await screen.findByRole("button", { name: "Tambah Guru Pengajar" }));
    await screen.findByLabelText(/^Guru\*?$/);
    await user.click(screen.getByRole("button", { name: "Tambahkan" }));

    expect(await screen.findByText("Guru wajib dipilih")).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        const url = typeof input === "string" ? input : input.toString();
        return url.includes("/teaching-assignments") && init?.method === "POST";
      }),
    ).toBe(false);
  });

  it("submits the filled form as POST .../teaching-assignments with the expected body", async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetchForAddTeacher({ status: 201, body: { id: "ta-1" } });
    vi.stubGlobal("fetch", fetchMock);
    render(<ClassDetailClient classId="class-1" canWrite />);

    await user.click(await screen.findByRole("button", { name: "Tambah Guru Pengajar" }));
    await screen.findByLabelText(/^Guru\*?$/);
    await user.click(screen.getByRole("option", { name: /Ustadzah Fatimah/ }));
    await user.click(screen.getByRole("button", { name: "Tambahkan" }));

    const { toast } = await import("sonner");
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Guru ditambahkan"));

    const postCall = fetchMock.mock.calls.find(([input, init]) => {
      const url = typeof input === "string" ? input : input.toString();
      return url.includes("/teaching-assignments") && init?.method === "POST";
    })!;
    expect(JSON.parse((postCall[1] as RequestInit).body as string)).toEqual({
      employeeId: "emp-2",
      role: "HOMEROOM",
    });
  });
});

describe("ClassDetailClient — Recipe 2b dossier layout", () => {
  const originalInnerWidth = window.innerWidth;

  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: originalInnerWidth,
    });
  });

  it("renders every dossier section as a hash-addressable anchor", async () => {
    vi.stubGlobal("fetch", stubFetch([]));
    render(<ClassDetailClient classId="class-1" canWrite />);

    // Section ids double as DOM anchors that DossierNav / #hash deep links
    // jump to — see the trigger rule + retrofit backlog in
    // .claude/standards/patterns.md Recipe 2b.
    await waitFor(() => {
      expect(document.getElementById("roster")).toBeInTheDocument();
      expect(document.getElementById("teachers")).toBeInTheDocument();
      expect(document.getElementById("sessions")).toBeInTheDocument();
    });
  });

  it("shows the Roster stat tile exactly once on mobile — not stacked above the sections and again in the rail", async () => {
    // useIsMobile() reads window.innerWidth inside an effect on mount; no
    // hook mock needed, just a narrow viewport before render (same technique
    // as components/teacher/__tests__/leave-sheet.test.tsx). matchMedia is
    // polyfilled globally in vitest.setup.dom.ts.
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: 375,
    });
    vi.stubGlobal("fetch", stubFetch([]));
    render(<ClassDetailClient classId="class-1" canWrite />);

    await waitFor(() => {
      expect(screen.getAllByText("Roster")).toHaveLength(1);
    });
  });
});

describe("ClassDetailClient — teacher-swap dialog (T6)", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens on ResponsiveFormDialog with the session's fields and submits a swap", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", stubFetchWithSession());
    render(<ClassDetailClient classId="class-1" canWrite />);

    await openSessionDialog(user);
    expect(await screen.findByText("Ubah Guru Sesi")).toBeInTheDocument();
    expect(screen.getByLabelText("Guru pengganti")).toBeInTheDocument();
    expect(screen.getByLabelText("Alasan pengganti")).toBeInTheDocument();

    await user.click(screen.getByRole("option", { name: /Ustadzah Fatimah/ }));
    await user.click(screen.getByRole("button", { name: "Simpan" }));

    const { toast } = await import("sonner");
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Guru sesi diperbarui"));
    await waitFor(() => expect(screen.queryByText("Ubah Guru Sesi")).not.toBeInTheDocument());
  });

  it("closes without saving when dismissed", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", stubFetchWithSession());
    render(<ClassDetailClient classId="class-1" canWrite />);

    await openSessionDialog(user);
    await screen.findByText("Ubah Guru Sesi");

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByText("Ubah Guru Sesi")).not.toBeInTheDocument());
  });

  it("hides the swap form and Simpan when the class's academic year is archived", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", stubFetchWithSession({ archived: true }));
    render(<ClassDetailClient classId="class-1" canWrite />);

    await openSessionDialog(user);
    expect(await screen.findByText("Ubah Guru Sesi")).toBeInTheDocument();
    expect(
      screen.getByText("Anda tidak memiliki akses untuk mengubah guru sesi."),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Guru pengganti")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Simpan" })).not.toBeInTheDocument();
  });
});
