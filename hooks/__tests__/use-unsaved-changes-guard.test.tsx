import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";

/* eslint-disable @next/next/no-html-link-for-pages -- plain anchors on purpose: the hook must guard real <a> clicks */
function Harness({ dirty }: { dirty: boolean }) {
  const guard = useUnsavedChangesGuard(dirty);
  return (
    <div>
      <a href="/teacher">Beranda</a>
      <a href="/teacher/sessions/abc#top">Sama</a>
      <a href="https://example.com/x">Luar</a>
      <a href="/teacher/kelas" target="_blank">Tab baru</a>
      {guard.confirmOpen ? (
        <div role="dialog">
          <button onClick={guard.stay}>Tetap</button>
          <button onClick={guard.confirmLeave}>Keluar</button>
        </div>
      ) : null}
    </div>
  );
}

let pushState: ReturnType<typeof vi.spyOn>;
let back: ReturnType<typeof vi.spyOn>;
let go: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  router.push.mockClear();
  router.replace.mockClear();
  window.history.replaceState(null, "", "/teacher/sessions/abc");
  pushState = vi.spyOn(window.history, "pushState");
  back = vi.spyOn(window.history, "back").mockImplementation(() => {});
  go = vi.spyOn(window.history, "go").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

const beforeUnload = () => {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};

/**
 * Click and report whether the guard vetoed it. jsdom cannot navigate, so a
 * bubble-phase listener (which runs after the guard's capture-phase one)
 * records the verdict and then cancels the click itself to keep jsdom quiet.
 */
function clickVetoed(element: HTMLElement, init: MouseEventInit = {}) {
  let vetoed = false;
  const record = (event: Event) => {
    vetoed = event.defaultPrevented;
    event.preventDefault();
  };
  document.addEventListener("click", record);
  fireEvent.click(element, init);
  document.removeEventListener("click", record);
  return vetoed;
}

describe("useUnsavedChangesGuard (TCH-2)", () => {
  it("does nothing while the page is clean", () => {
    render(<Harness dirty={false} />);
    expect(beforeUnload()).toBe(false);
    expect(clickVetoed(screen.getByText("Beranda"))).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(pushState).not.toHaveBeenCalled();
  });

  it("blocks reload / tab close with the native prompt only when dirty", () => {
    const view = render(<Harness dirty />);
    expect(beforeUnload()).toBe(true);
    view.rerender(<Harness dirty={false} />);
    expect(beforeUnload()).toBe(false);
  });

  it("intercepts an in-app link, and leaves only after confirmation", () => {
    render(<Harness dirty />);
    fireEvent.click(screen.getByText("Beranda"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Tetap"));
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByText("Beranda"));
    fireEvent.click(screen.getByText("Keluar"));
    // The sentinel entry is on top, so it is replaced rather than stacked.
    expect(router.replace).toHaveBeenCalledWith("/teacher");
  });

  it("lets through links that do not leave the page or that the browser handles", () => {
    render(<Harness dirty />);
    for (const label of ["Sama", "Luar", "Tab baru"]) {
      expect(clickVetoed(screen.getByText(label))).toBe(false);
    }
    expect(screen.queryByRole("dialog")).toBeNull();
    // A modified click (open in new tab) is not a navigation of this tab either.
    expect(clickVetoed(screen.getByText("Beranda"), { ctrlKey: true })).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("puts a sentinel on the history and turns Back into a question", () => {
    render(<Harness dirty />);
    expect(pushState).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // Re-armed, so a second Back asks again instead of leaving.
    expect(pushState).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByText("Keluar"));
    expect(go).toHaveBeenCalledWith(-2);
  });

  it("consumes the sentinel once the page is clean, so Back is a single step again", () => {
    const view = render(<Harness dirty />);
    expect(back).not.toHaveBeenCalled();
    view.rerender(<Harness dirty={false} />);
    expect(back).toHaveBeenCalledTimes(1);
    // That popstate is ours and must not raise the dialog.
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
