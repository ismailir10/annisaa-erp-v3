import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { UnsavedChangesProvider, useUnsavedChangesGuard } from "../unsaved-changes-provider";
import { GuardedLink } from "../guarded-link";

const push = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

function DirtyRegistrar({ dirty }: { dirty: boolean }) {
  useUnsavedChangesGuard(dirty, "Perubahan pada halaman ini akan hilang.");
  return null;
}

function Harness({ dirty, target }: { dirty: boolean; target?: "_blank" }) {
  return (
    <UnsavedChangesProvider>
      <DirtyRegistrar dirty={dirty} />
      <GuardedLink href="/admin/other" target={target}>
        Lainnya
      </GuardedLink>
    </UnsavedChangesProvider>
  );
}

describe("UnsavedChangesProvider + GuardedLink", () => {
  beforeEach(() => {
    push.mockClear();
    // A click that isn't intercepted falls through to next/link's own
    // navigation, which jsdom doesn't implement — it logs a harmless
    // "Not implemented: navigation" via the virtual console. Silence it so
    // it doesn't drown out real failures; the assertions below are what
    // actually prove nothing was intercepted.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens the shared confirm dialog on a plain click while a guard is dirty", () => {
    render(<Harness dirty />);

    fireEvent.click(screen.getByRole("link", { name: "Lainnya" }));

    expect(screen.getByText("Keluar tanpa menyimpan?")).toBeInTheDocument();
    // The guard's own message is surfaced in the shared dialog.
    expect(screen.getByText("Perubahan pada halaman ini akan hilang.")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("cancel closes the dialog and never navigates", async () => {
    const user = userEvent.setup();
    render(<Harness dirty />);

    await user.click(screen.getByRole("link", { name: "Lainnya" }));
    await user.click(screen.getByRole("button", { name: "Batal" }));

    await waitFor(() => {
      expect(screen.queryByText("Keluar tanpa menyimpan?")).not.toBeInTheDocument();
    });
    expect(push).not.toHaveBeenCalled();
  });

  it("confirm navigates via router.push to the link's href", async () => {
    const user = userEvent.setup();
    render(<Harness dirty />);

    await user.click(screen.getByRole("link", { name: "Lainnya" }));
    await user.click(screen.getByRole("button", { name: "Ya, Keluar" }));

    expect(push).toHaveBeenCalledExactlyOnceWith("/admin/other");
  });

  it("does not intercept when no guard is dirty", () => {
    render(<Harness dirty={false} />);

    fireEvent.click(screen.getByRole("link", { name: "Lainnya" }));

    expect(screen.queryByText("Keluar tanpa menyimpan?")).not.toBeInTheDocument();
  });

  it("does not intercept modifier-clicks even while dirty", () => {
    render(<Harness dirty />);
    const link = screen.getByRole("link", { name: "Lainnya" });

    fireEvent.click(link, { metaKey: true });
    fireEvent.click(link, { ctrlKey: true });
    fireEvent.click(link, { shiftKey: true });
    fireEvent.click(link, { button: 1 });

    expect(screen.queryByText("Keluar tanpa menyimpan?")).not.toBeInTheDocument();
  });

  it("does not intercept target=_blank links even while dirty", () => {
    render(<Harness dirty target="_blank" />);

    fireEvent.click(screen.getByRole("link", { name: "Lainnya" }));

    expect(screen.queryByText("Keluar tanpa menyimpan?")).not.toBeInTheDocument();
  });

  it("stops guarding once the dirty page unmounts", () => {
    const { rerender } = render(<Harness dirty />);
    rerender(
      <UnsavedChangesProvider>
        <GuardedLink href="/admin/other">Lainnya</GuardedLink>
      </UnsavedChangesProvider>,
    );

    fireEvent.click(screen.getByRole("link", { name: "Lainnya" }));

    expect(screen.queryByText("Keluar tanpa menyimpan?")).not.toBeInTheDocument();
  });

  it("useUnsavedChangesGuard no-ops outside a provider (e.g. a unit test rendering a page alone)", () => {
    expect(() => render(<DirtyRegistrar dirty />)).not.toThrow();
  });
});
