/**
 * Admin UI audit fixes (T2, finding #1) — `components/ui/field.tsx` renders
 * `FieldLabel` as a plain sibling `<Label>`, never a wrapper, so a control
 * with no `htmlFor`/`id` pair has NO accessible name at all.
 * `screen.getByLabelText` resolves a control only through a real label
 * association (`<label for>`, `aria-labelledby`, or wrapping `<label>`) — it
 * does NOT fall back to nearby unassociated text. Against the pre-fix
 * markup (`<FieldLabel>Nama Lengkap</FieldLabel><Input .../>` with no
 * `htmlFor`/`id`) every assertion below would throw
 * `Unable to find a label with the text of: ...`. This test only passes
 * because `app/admin/students/page.tsx` now wires `htmlFor`/`id` pairs
 * (e.g. `student-name`, `student-gender`) between each `FieldLabel` and its
 * control.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import StudentsPage from "@/app/admin/students/page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

function stubFetch() {
  return vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/students/stats")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ total: 0, active: 0, graduated: 0 }),
      } as Response);
    }
    if (url.includes("/api/students?")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          data: [],
          pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
        }),
      } as Response);
    }
    return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
  });
}

describe("StudentsPage — create dialog accessible names (AC1)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", stubFetch());
  });

  it("resolves getByLabelText for representative fields, including the required one", async () => {
    const user = userEvent.setup();
    render(<StudentsPage />);

    await user.click(await screen.findByRole("button", { name: "Tambah Siswa" }));

    // Required field — also asserts the required+aria-required wiring the
    // spec calls for alongside every `<FieldLabel required>`. The label's
    // textContent includes a trailing `aria-hidden` asterisk span
    // ("Nama Lengkap*"), so the query anchors on it rather than
    // requiring an exact string match.
    const nameInput = screen.getByLabelText(/^Nama Lengkap\*?$/);
    expect(nameInput).toBeInTheDocument();
    expect(nameInput).toBeRequired();
    expect(nameInput).toHaveAttribute("aria-required", "true");

    // Plain Input.
    expect(screen.getByLabelText("Nama Panggilan")).toBeInTheDocument();
    expect(screen.getByLabelText("NIS")).toBeInTheDocument();

    // Textarea.
    expect(screen.getByLabelText("Catatan")).toBeInTheDocument();

    // shadcn <Select> — id lives on <SelectTrigger>, not <Select>.
    expect(screen.getByLabelText("Jenis Kelamin")).toBeInTheDocument();
    expect(screen.getByLabelText("Tinggal Dengan")).toBeInTheDocument();
    expect(screen.getByLabelText("Status")).toBeInTheDocument();
  });
});
