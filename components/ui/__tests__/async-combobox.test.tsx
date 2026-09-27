/**
 * AsyncCombobox — generic debounced-search combobox behind
 * parent-picker / student-picker / class-section-picker.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AsyncCombobox } from "../async-combobox";

type Item = { id: string; label: string };

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function setup() {
  return userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
}

describe("AsyncCombobox", () => {
  it("debounces the fetcher and calls it with the typed query", async () => {
    const fetcher = vi.fn(async () => [] as Item[]);
    render(
      <AsyncCombobox<Item>
        value={null}
        onChange={vi.fn()}
        fetcher={fetcher}
        getKey={(i) => i.id}
        getLabel={(i) => i.label}
        searchPlaceholder="Cari..."
      />,
    );

    const user = setup();
    await user.click(screen.getByRole("combobox"));
    await user.type(screen.getByPlaceholderText("Cari..."), "budi");

    expect(fetcher).not.toHaveBeenCalled();

    vi.advanceTimersByTime(250);
    await waitFor(() =>
      expect(fetcher).toHaveBeenCalledWith("budi", expect.any(AbortSignal)),
    );
  });

  it("renders fetched results and calls onChange when one is selected", async () => {
    const fetcher = vi.fn(async () => [{ id: "1", label: "Budi Santoso" }]);
    const onChange = vi.fn();
    render(
      <AsyncCombobox<Item>
        value={null}
        onChange={onChange}
        fetcher={fetcher}
        getKey={(i) => i.id}
        getLabel={(i) => i.label}
      />,
    );

    const user = setup();
    await user.click(screen.getByRole("combobox"));
    vi.advanceTimersByTime(300);
    await waitFor(() =>
      expect(screen.getByText("Budi Santoso")).toBeInTheDocument(),
    );

    await user.click(screen.getByText("Budi Santoso"));
    expect(onChange).toHaveBeenCalledWith({ id: "1", label: "Budi Santoso" });
  });

  it("aborts the stale request once a newer query supersedes it", async () => {
    const signals: AbortSignal[] = [];
    let resolveSecond: ((items: Item[]) => void) | undefined;
    const fetcher = vi.fn((query: string, signal: AbortSignal) => {
      signals.push(signal);
      if (query === "a") {
        // Never resolves — stands in for a slow in-flight request that the
        // next keystroke should abort rather than race against.
        return new Promise<Item[]>(() => {});
      }
      return new Promise<Item[]>((resolve) => {
        resolveSecond = resolve;
      });
    });

    render(
      <AsyncCombobox<Item>
        value={null}
        onChange={vi.fn()}
        fetcher={fetcher}
        getKey={(i) => i.id}
        getLabel={(i) => i.label}
      />,
    );

    const user = setup();
    await user.click(screen.getByRole("combobox"));
    // cmdk's own input carries `role="combobox"` too (ARIA 1.1 combobox
    // pattern) — query by placeholder to get the search box, not the
    // trigger button.
    const input = screen.getByPlaceholderText("Cari...");

    await user.type(input, "a");
    vi.advanceTimersByTime(300);
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));

    await user.type(input, "b");
    vi.advanceTimersByTime(300);
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));

    expect(signals[0]?.aborted).toBe(true);

    resolveSecond?.([{ id: "1", label: "ab-result" }]);
    await waitFor(() =>
      expect(screen.getByText("ab-result")).toBeInTheDocument(),
    );
  });

  it("resets the value to null via the clear button", async () => {
    const onChange = vi.fn();
    const selected: Item = { id: "1", label: "Selected" };
    render(
      <AsyncCombobox<Item>
        value={selected}
        onChange={onChange}
        fetcher={async () => []}
        getKey={(i) => i.id}
        getLabel={(i) => i.label}
      />,
    );

    const user = setup();
    await user.click(screen.getByRole("button", { name: "Hapus pilihan" }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("hides the clear button when clearable is false", () => {
    const selected: Item = { id: "1", label: "Selected" };
    render(
      <AsyncCombobox<Item>
        value={selected}
        onChange={vi.fn()}
        fetcher={async () => []}
        getKey={(i) => i.id}
        getLabel={(i) => i.label}
        clearable={false}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Hapus pilihan" }),
    ).not.toBeInTheDocument();
  });

  it("shows the error row and recovers on retry", async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce([{ id: "1", label: "Recovered" }]);
    render(
      <AsyncCombobox<Item>
        value={null}
        onChange={vi.fn()}
        fetcher={fetcher}
        getKey={(i) => i.id}
        getLabel={(i) => i.label}
      />,
    );

    const user = setup();
    await user.click(screen.getByRole("combobox"));
    vi.advanceTimersByTime(300);
    await waitFor(() =>
      expect(screen.getByText("Gagal memuat. Coba lagi.")).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: "Coba lagi" }));
    await waitFor(() =>
      expect(screen.getByText("Recovered")).toBeInTheDocument(),
    );
  });

  it("shows the empty-state text when a search returns nothing", async () => {
    const fetcher = vi.fn(async () => [] as Item[]);
    render(
      <AsyncCombobox<Item>
        value={null}
        onChange={vi.fn()}
        fetcher={fetcher}
        getKey={(i) => i.id}
        getLabel={(i) => i.label}
        emptyText="Tidak ditemukan"
      />,
    );

    const user = setup();
    await user.click(screen.getByRole("combobox"));
    vi.advanceTimersByTime(300);
    await waitFor(() =>
      expect(screen.getByText("Tidak ditemukan")).toBeInTheDocument(),
    );
  });

  it("stays idle on whitespace-only input — minQueryLength compares the trimmed length", async () => {
    const fetcher = vi.fn(async () => [] as Item[]);
    render(
      <AsyncCombobox<Item>
        value={null}
        onChange={vi.fn()}
        fetcher={fetcher}
        getKey={(i) => i.id}
        getLabel={(i) => i.label}
        idleText="Ketik untuk mencari."
        minQueryLength={1}
      />,
    );

    const user = setup();
    await user.click(screen.getByRole("combobox"));
    // cmdk's own input carries `role="combobox"` too — query by placeholder.
    await user.type(screen.getByPlaceholderText("Cari..."), "   ");
    vi.advanceTimersByTime(300);

    expect(fetcher).not.toHaveBeenCalled();
    expect(screen.getByText("Ketik untuk mencari.")).toBeInTheDocument();
  });

  it("sorts group headings alphabetically, not in first-seen order", async () => {
    type Grouped = Item & { group: string };
    const fetcher = vi.fn(
      async () =>
        [
          { id: "1", label: "Kelas Cempaka", group: "Taman Cempaka" },
          { id: "2", label: "Kelas Aster", group: "An Nisaa Aster" },
        ] as Grouped[],
    );
    render(
      <AsyncCombobox<Grouped>
        value={null}
        onChange={vi.fn()}
        fetcher={fetcher}
        getKey={(i) => i.id}
        getLabel={(i) => i.label}
        getGroup={(i) => i.group}
      />,
    );

    const user = setup();
    await user.click(screen.getByRole("combobox"));
    vi.advanceTimersByTime(300);
    await waitFor(() =>
      expect(screen.getByText("Kelas Cempaka")).toBeInTheDocument(),
    );

    // The popover content renders into a portal appended to `document.body`,
    // outside the render() root — query the whole document, not `container`.
    const headings = Array.from(
      document.querySelectorAll("[cmdk-group-heading]"),
    ).map((el) => el.textContent);
    expect(headings).toEqual(["An Nisaa Aster", "Taman Cempaka"]);
  });

  it("aborts a retry's in-flight request on unmount", async () => {
    const signals: AbortSignal[] = [];
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockImplementationOnce((_query: string, signal: AbortSignal) => {
        signals.push(signal);
        return new Promise<Item[]>(() => {}); // never resolves
      });

    const { unmount } = render(
      <AsyncCombobox<Item>
        value={null}
        onChange={vi.fn()}
        fetcher={fetcher}
        getKey={(i) => i.id}
        getLabel={(i) => i.label}
      />,
    );

    const user = setup();
    await user.click(screen.getByRole("combobox"));
    vi.advanceTimersByTime(300);
    await waitFor(() =>
      expect(screen.getByText("Gagal memuat. Coba lagi.")).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: "Coba lagi" }));
    await waitFor(() => expect(signals).toHaveLength(1));
    expect(signals[0]?.aborted).toBe(false);

    unmount();
    expect(signals[0]?.aborted).toBe(true);
  });
});
