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
