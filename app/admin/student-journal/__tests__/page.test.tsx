/**
 * T6 — the journal category/indicator create-edit forms were raw <Dialog>s;
 * they now go through the shared ResponsiveFormDialog (ui.md / crud.md
 * Dialog Standard). This drives the category create flow end to end
 * against a stubbed fetch to prove the new dialog still opens, submits and
 * cancels correctly.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";

import StudentJournalAdminPage from "../page";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

// Same precedent as app/admin/classes/[id]/__tests__/client.test.tsx —
// Base UI's Select internals (open/positioning) are unrelated to this
// dialog conversion, so render its pieces as plain, always-visible elements.
vi.mock("@/components/ui/select", () => {
  const SelectCtx = React.createContext<{ onValueChange?: (v: string) => void }>({});

  function Select({
    onValueChange,
    children,
  }: {
    value?: string;
    onValueChange?: (v: string) => void;
    items?: Record<string, string>;
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
  }: {
    value: string;
    children: React.ReactNode;
  }) {
    const ctx = React.useContext(SelectCtx);
    return (
      <div role="option" aria-selected={false} onClick={() => ctx.onValueChange?.(value)}>
        {children}
      </div>
    );
  }
  return { Select, SelectTrigger, SelectValue, SelectContent, SelectItem };
});

function emptyCategories() {
  return { data: [] };
}

function stubFetch() {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";

    if (url.startsWith("/api/student-journal/categories") && method === "GET") {
      return Promise.resolve({ ok: true, json: async () => emptyCategories() } as Response);
    }
    if (url === "/api/student-journal/categories" && method === "POST") {
      return Promise.resolve({
        ok: true,
        json: async () => ({ id: "cat-1", name: "Ibadah", scope: "SCHOOL", order: 0, status: "ACTIVE", indicators: [] }),
      } as Response);
    }
    return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
  });
}

// One seeded category (no indicators yet) — for the indicator dialog tests,
// which need something to click "Tambah Indikator" on.
const oneCategory = {
  data: [
    { id: "cat-1", name: "Ibadah", scope: "SCHOOL", order: 0, status: "ACTIVE", indicators: [] },
  ],
};

function stubFetchWithCategory() {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";

    if (url.startsWith("/api/student-journal/categories") && method === "GET") {
      return Promise.resolve({ ok: true, json: async () => oneCategory } as Response);
    }
    if (url === "/api/student-journal/indicators" && method === "POST") {
      return Promise.resolve({
        ok: true,
        json: async () => ({ id: "ind-1", categoryId: "cat-1", label: "Tahfizul Qur'an", order: 0, status: "ACTIVE" }),
      } as Response);
    }
    return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
  });
}

describe("StudentJournalAdminPage — category dialog (T6)", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates a category through the ResponsiveFormDialog", async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch();
    vi.stubGlobal("fetch", fetchMock);
    render(<StudentJournalAdminPage />);

    await user.click(await screen.findByRole("button", { name: "Tambah Kategori" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Tambah Kategori" })).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText(/^Nama Kategori\*?$/), "Ibadah");
    await user.click(within(dialog).getByRole("button", { name: "Tambah Kategori" }));

    const { toast } = await import("sonner");
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Kategori ditambahkan"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    const createCall = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === "POST",
    );
    expect(createCall).toBeDefined();
    expect(JSON.parse((createCall![1] as RequestInit).body as string)).toMatchObject({
      name: "Ibadah",
      scope: "SCHOOL",
    });
  });

  it("shows an inline error and keeps the dialog open for an empty name", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", stubFetch());
    render(<StudentJournalAdminPage />);

    await user.click(await screen.findByRole("button", { name: "Tambah Kategori" }));
    const dialog = await screen.findByRole("dialog");

    await user.click(within(dialog).getByRole("button", { name: "Tambah Kategori" }));

    expect(await within(dialog).findByText("Nama kategori wajib diisi")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("cancels without creating a category", async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch();
    vi.stubGlobal("fetch", fetchMock);
    render(<StudentJournalAdminPage />);

    await user.click(await screen.findByRole("button", { name: "Tambah Kategori" }));
    const dialog = await screen.findByRole("dialog");

    await user.click(within(dialog).getByRole("button", { name: "Batal" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "POST")).toBe(
      false,
    );
  });
});

// T3 (cycle 2026-09-27, admin-forms-rhf) — Tambah Indikator migrated onto
// useZodForm(indicatorFormSchema) + FormField.
describe("StudentJournalAdminPage — indicator dialog (T3 rhf migration)", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  async function openAddIndicatorDialog(user: ReturnType<typeof userEvent.setup>) {
    // The accordion header also renders "Naikkan/Turunkan kategori Ibadah"
    // reorder buttons, so target the trigger by its own text and walk up to
    // the nearest <button> instead of matching by accessible name.
    const trigger = (await screen.findByText("Ibadah")).closest("button");
    if (!trigger) throw new Error("category accordion trigger not found");
    await user.click(trigger);
    await user.click(await screen.findByRole("button", { name: "Tambah Indikator" }));
  }

  it("blocks submit with an empty label, showing an inline error and firing no POST", async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetchWithCategory();
    vi.stubGlobal("fetch", fetchMock);
    render(<StudentJournalAdminPage />);

    await openAddIndicatorDialog(user);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: /Tambah Indikator/ })).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Tambah Indikator" }));

    expect(await within(dialog).findByText("Label indikator wajib diisi")).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(
        ([, init]) => (init as RequestInit | undefined)?.method === "POST",
      ),
    ).toBe(false);
  });

  it("submits the filled form as POST /api/student-journal/indicators with the expected body", async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetchWithCategory();
    vi.stubGlobal("fetch", fetchMock);
    render(<StudentJournalAdminPage />);

    await openAddIndicatorDialog(user);
    const dialog = await screen.findByRole("dialog");

    await user.type(within(dialog).getByLabelText(/^Label Indikator\*?$/), "Tahfizul Qur'an");
    await user.click(within(dialog).getByRole("button", { name: "Tambah Indikator" }));

    const { toast } = await import("sonner");
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Indikator ditambahkan"));

    const createCall = fetchMock.mock.calls.find(
      ([url, init]) => url === "/api/student-journal/indicators" && (init as RequestInit | undefined)?.method === "POST",
    );
    expect(createCall).toBeDefined();
    expect(JSON.parse((createCall![1] as RequestInit).body as string)).toEqual({
      categoryId: "cat-1",
      label: "Tahfizul Qur'an",
      order: 0,
    });
  });
});
