/**
 * T6c — employee detail migrated from AdminTabs to the Recipe 2b Dossier
 * layout (patterns.md). The contracts worth pinning here are the ones the
 * migration could silently break:
 *
 *  - every visible section is hash-addressable (`id` on the DOM node
 *    matches the `DossierNav` target), which is the whole point of trading
 *    tabs for one long scroll;
 *  - the Gaji section is permission-gated exactly like the old Gaji tab
 *    was — the server sends `salaryValues: null` (not `[]`) when the
 *    viewer lacks payroll access, and that must stay hidden, not render an
 *    empty state;
 *  - Kehadiran stays lazy: it costs its own request, so it must not fire
 *    until the admin opens it, same as the old tab only mounting on click;
 *  - a `#attendance`-style deep link expands the (closed-by-default)
 *    target section and fires its fetch, mirroring the `hashHandled`
 *    pattern in app/admin/guardians/[id]/page.tsx.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import EmployeeDetailPage from "@/app/admin/(hr)/employees/[id]/page";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "e1" }),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const employee = {
  id: "e1",
  kode: "EMP-001",
  nama: "Budi Santoso",
  formalName: null,
  email: "budi@example.com",
  noHp: "081234567890",
  jabatan: "Guru Kelas",
  campusId: "c1",
  hireDate: "2022-01-10",
  status: "ACTIVE",
  bankAccountNo: "1234567890",
  bankName: "BCA",
  bpjsEnrolled: true,
  leaveBalanceAnnual: 12,
  leaveBalanceSick: 14,
  campus: { name: "Kampus Utama" },
};

const salaryValues = [
  {
    id: "sv1",
    value: 5000000,
    componentDefId: "comp1",
    componentDef: { code: "GAPOK", label: "Gaji Pokok", category: "INCOME", calcType: "FIXED", sortOrder: 1 },
  },
];

type Calls = { url: string; method: string }[];

function stubFetch(over: { salary?: unknown; salaryOk?: boolean } = {}) {
  const calls: Calls = [];
  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push({ url, method: init?.method ?? "GET" });

    if (url === "/api/employees/e1") {
      return Promise.resolve({ ok: true, json: async () => employee } as Response);
    }
    if (url === "/api/employees/e1/salary") {
      const ok = over.salaryOk ?? true;
      return Promise.resolve({ ok, json: async () => over.salary ?? salaryValues } as Response);
    }
    if (url === "/api/config/campuses") {
      return Promise.resolve({ ok: true, json: async () => [{ id: "c1", name: "Kampus Utama" }] } as Response);
    }
    if (url === "/api/employees/positions") {
      return Promise.resolve({ ok: true, json: async () => ["Guru Kelas"] } as Response);
    }
    if (url.startsWith("/api/employees/e1/attendance")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ records: [], summary: { present: 0, late: 0, absent: 0, leave: 0 } }),
      } as Response);
    }
    return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
  });
  return { fn, calls };
}

const urlsMatching = (calls: Calls, needle: string) => calls.filter((c) => c.url.includes(needle));

describe("employee dossier — hash-addressable sections", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    // Deep-link tests set the hash directly; nothing else here clears it
    // between tests, so leaking it would make later renders think they
    // already have a target to jump to.
    window.location.hash = "";
  });

  it("renders every visible section with a hash-addressable id", async () => {
    const { fn } = stubFetch();
    vi.stubGlobal("fetch", fn);
    render(<EmployeeDetailPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Budi Santoso" })).toBeInTheDocument());

    for (const id of ["profile", "employment", "leave", "salary", "attendance"]) {
      expect(document.getElementById(id)).not.toBeNull();
    }
  });

  it("hides the Gaji section when the server withholds salaryValues (no payroll access)", async () => {
    const { fn } = stubFetch({ salary: null, salaryOk: false });
    vi.stubGlobal("fetch", fn);
    render(<EmployeeDetailPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Budi Santoso" })).toBeInTheDocument());

    expect(document.getElementById("salary")).toBeNull();
    expect(screen.queryByText("Gaji")).not.toBeInTheDocument();
    // The rest of the dossier still renders — the gate hides one section,
    // not the page.
    expect(document.getElementById("profile")).not.toBeNull();
    expect(document.getElementById("attendance")).not.toBeNull();
  });

  it("does not request attendance until the Kehadiran section is opened", async () => {
    const user = userEvent.setup();
    const { fn, calls } = stubFetch();
    vi.stubGlobal("fetch", fn);
    render(<EmployeeDetailPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Budi Santoso" })).toBeInTheDocument());
    expect(urlsMatching(calls, "/attendance")).toHaveLength(0);

    const section = document.getElementById("attendance");
    const trigger = section?.querySelector<HTMLElement>('[data-slot="collapsible-trigger"]');
    expect(trigger).not.toBeNull();
    await user.click(trigger!);

    await waitFor(() => expect(urlsMatching(calls, "/attendance")).toHaveLength(1));
  });

  it("expands and fetches the Kehadiran section from a #attendance deep link", async () => {
    window.location.hash = "#attendance";
    const { fn, calls } = stubFetch();
    vi.stubGlobal("fetch", fn);
    render(<EmployeeDetailPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Budi Santoso" })).toBeInTheDocument());

    // Closed by default — the hash effect must be the thing that opened it.
    await waitFor(() => expect(urlsMatching(calls, "/attendance")).toHaveLength(1));

    const section = document.getElementById("attendance");
    const trigger = section?.querySelector<HTMLElement>('[data-slot="collapsible-trigger"]');
    expect(trigger).toHaveAttribute("data-panel-open");
  });
});
