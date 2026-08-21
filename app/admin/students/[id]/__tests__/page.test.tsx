/**
 * T7 — override-confirm UI for the students-detail enroll door.
 *
 * The server (app/api/students/[id]/enroll/route.ts) is advisory-only for
 * age: a 409 AGE_OUT_OF_RANGE can be overridden by resubmitting with a
 * non-empty `ageOverrideReason`; a 409 ALREADY_ENROLLED cannot be
 * overridden at all. These tests drive the real `handleEnroll` + Dialog
 * rendering in app/admin/students/[id]/page.tsx against a stubbed fetch to
 * prove the confirm step behaves per the cycle doc's Task T7 acceptance
 * criteria.
 *
 * `ClassSectionCombobox` is a Popover+cmdk combobox with no jsdom-tested
 * precedent anywhere in this repo (grep confirms zero existing tests drive
 * it) — cmdk's `CommandList` calls `new ResizeObserver(...)` on mount,
 * which jsdom does not implement, and Popover positioning adds further
 * flakiness for no behavioural payoff here. It is mocked to a native
 * `<select>` below so these tests exercise the real state machine
 * (handleEnroll, the confirm-step render, focus, disabled gating) without
 * fighting portal/positioning internals unrelated to T7. This mirrors the
 * repo's own precedent of mocking `@/components/ui/select` when a test
 * needs to actually pick a value (app/teacher/class-attendance/__tests__/page.test.tsx).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import StudentDetailPage from "@/app/admin/students/[id]/page";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "s1" }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/components/admin/class-section-picker", () => ({
  ClassSectionCombobox: ({
    id,
    value,
    onChange,
    sections,
  }: {
    id?: string;
    value: string;
    onChange: (id: string) => void;
    sections: Array<{ id: string; name: string }>;
  }) => (
    <select
      id={id}
      aria-required="true"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">-- pilih --</option>
      {sections.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  ),
}));

// cmdk's CommandList (used elsewhere on this page, e.g. Promote) calls
// `new ResizeObserver(...)` on mount — jsdom has no global ResizeObserver.
// Stubbed here (not in vitest.setup.ts) since T7's scope is this page only.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

const student = {
  id: "s1",
  name: "Aisyah Putri",
  nickname: null,
  dateOfBirth: "2023-01-15",
  gender: null,
  address: null,
  notes: null,
  metadata: null,
  status: "ACTIVE",
  nis: null,
  nisn: null,
  birthPlace: null,
  nik: null,
  kkNumber: null,
  livingWith: null,
  photoUrl: null,
  withdrawalReason: null,
  withdrawalDate: null,
  graduationDate: null,
  guardians: [],
  enrollments: [],
};

const sectionKB = {
  id: "sec-kb",
  name: "KB 1",
  program: { name: "Kelompok Bermain" },
  academicYear: { name: "2025/2026" },
  campus: { name: "Kampus A" },
  _count: { enrollments: 5 },
  capacity: 20,
};
const sectionTK = {
  id: "sec-tk",
  name: "TKIT A",
  program: { name: "Taman Kanak-kanak" },
  academicYear: { name: "2025/2026" },
  campus: { name: "Kampus A" },
  _count: { enrollments: 10 },
  capacity: 20,
};

const AGE_MESSAGE =
  "Usia anak 2 tahun 6 bulan (30 bulan) di bawah batas usia minimum program Kelompok Bermain (36–48 bulan), per awal tahun ajaran 14 Juli 2025.";
const ALREADY_ENROLLED_MESSAGE =
  "Siswa sudah terdaftar di kelas TKIT A pada tahun ajaran ini.";

type EnrollResponse = { status: number; body: Record<string, unknown> };

/** Stubs `fetch` for the three endpoints this page calls in these tests. */
function stubFetch(enrollResponses: EnrollResponse[]) {
  let call = 0;
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";

    if (url.includes("/api/students/s1/enroll") && method === "POST") {
      const resp = enrollResponses[Math.min(call, enrollResponses.length - 1)];
      call += 1;
      return Promise.resolve({
        ok: resp.status < 300,
        status: resp.status,
        json: async () => resp.body,
      } as Response);
    }
    if (url.includes("/api/class-sections")) {
      return Promise.resolve({
        ok: true,
        json: async () => [sectionKB, sectionTK],
      } as Response);
    }
    if (url === "/api/students/s1") {
      return Promise.resolve({ ok: true, json: async () => student } as Response);
    }
    return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
  });
}

async function openEnrollDialogAndPick(user: ReturnType<typeof userEvent.setup>, sectionId: string) {
  await user.click(await screen.findByRole("button", { name: "Daftarkan ke Kelas" }));
  const select = await screen.findByLabelText(/^Pilih Kelas\*?$/);
  await user.selectOptions(select, sectionId);
}

describe("StudentDetailPage — enroll override-confirm (T7)", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
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
    render(<StudentDetailPage />);

    await openEnrollDialogAndPick(user, "sec-kb");
    await user.click(screen.getByRole("button", { name: "Daftarkan" }));

    // Server message shown verbatim — not rebuilt client-side.
    const banner = await screen.findByText(AGE_MESSAGE);
    expect(banner).toBeInTheDocument();

    // Confirm button starts disabled — no reason yet.
    const confirmBtn = screen.getByRole("button", { name: "Tetap Daftarkan" });
    expect(confirmBtn).toBeDisabled();

    // Focus moved to the confirm step for screen-reader/keyboard users.
    await waitFor(() => {
      expect(document.activeElement).toHaveAttribute("role", "alert");
    });

    const reasonField = screen.getByLabelText(/^Alasan\*?$/);
    await user.type(reasonField, "Penempatan sesuai kemampuan anak");
    expect(confirmBtn).not.toBeDisabled();

    await user.click(confirmBtn);

    const { toast } = await import("sonner");
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Didaftarkan ke kelas"));
    // Dialog closes on success.
    await waitFor(() => expect(screen.queryByText(AGE_MESSAGE)).not.toBeInTheDocument());
  });

  it("AGE_OUT_OF_RANGE: warn → cancel returns to the picker with a cleared reason", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      stubFetch([{ status: 409, body: { error: AGE_MESSAGE, code: "AGE_OUT_OF_RANGE", ageMonths: 30, ageMin: 36, ageMax: 48 } }]),
    );
    render(<StudentDetailPage />);

    await openEnrollDialogAndPick(user, "sec-kb");
    await user.click(screen.getByRole("button", { name: "Daftarkan" }));

    await screen.findByText(AGE_MESSAGE);
    await user.type(screen.getByLabelText(/^Alasan\*?$/), "some reason");

    await user.click(screen.getByRole("button", { name: "Batal" }));

    // Back at the picker — no banner, no reason field, class picker visible again.
    expect(screen.queryByText(AGE_MESSAGE)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Alasan\*?$/)).not.toBeInTheDocument();
    const select = await screen.findByLabelText(/^Pilih Kelas\*?$/);
    expect(select).toBeInTheDocument();
  });

  it("keeps the confirm button disabled for a whitespace-only reason", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      stubFetch([{ status: 409, body: { error: AGE_MESSAGE, code: "AGE_OUT_OF_RANGE", ageMonths: 30, ageMin: 36, ageMax: 48 } }]),
    );
    render(<StudentDetailPage />);

    await openEnrollDialogAndPick(user, "sec-kb");
    await user.click(screen.getByRole("button", { name: "Daftarkan" }));
    await screen.findByText(AGE_MESSAGE);

    const confirmBtn = screen.getByRole("button", { name: "Tetap Daftarkan" });
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
    render(<StudentDetailPage />);

    await openEnrollDialogAndPick(user, "sec-tk");
    await user.click(screen.getByRole("button", { name: "Daftarkan" }));

    await screen.findByText(ALREADY_ENROLLED_MESSAGE);
    expect(screen.queryByLabelText(/^Alasan\*?$/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tetap Daftarkan" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pilih Kelas Lain" })).toBeInTheDocument();
  });

  it("resets the override state when the dialog is closed and reopened", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      stubFetch([{ status: 409, body: { error: AGE_MESSAGE, code: "AGE_OUT_OF_RANGE", ageMonths: 30, ageMin: 36, ageMax: 48 } }]),
    );
    render(<StudentDetailPage />);

    await openEnrollDialogAndPick(user, "sec-kb");
    await user.click(screen.getByRole("button", { name: "Daftarkan" }));
    await screen.findByText(AGE_MESSAGE);
    await user.type(screen.getByLabelText(/^Alasan\*?$/), "some reason");

    // Escape closes the Dialog (Base UI's default dismissible behaviour).
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByText(AGE_MESSAGE)).not.toBeInTheDocument());

    // Reopen — the confirm step must not survive; the picker is fresh.
    await user.click(await screen.findByRole("button", { name: "Daftarkan ke Kelas" }));
    const select = await screen.findByLabelText(/^Pilih Kelas\*?$/);
    expect(select).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Alasan\*?$/)).not.toBeInTheDocument();
    expect(screen.queryByText(AGE_MESSAGE)).not.toBeInTheDocument();
  });
});
