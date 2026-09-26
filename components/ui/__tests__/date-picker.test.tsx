/**
 * DatePicker — drop-in replacement for `<Input type="date">`.
 *
 * Fine pointer: shadcn Button trigger + Calendar popover, values parsed and
 * formatted in LOCAL time (no `new Date("YYYY-MM-DD")`, which is UTC).
 * Coarse pointer (`(pointer: coarse)`): native `<input type="date">`, so the
 * platform's own date UI is used on touch.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DatePicker } from "../date-picker";

function mockPointer(coarse: boolean) {
  return vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: coarse && query.includes("coarse"),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as unknown as MediaQueryList,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DatePicker", () => {
  describe("fine pointer", () => {
    it("opens the Calendar popover and calls onChange with the local YYYY-MM-DD", async () => {
      mockPointer(false);
      const onChange = vi.fn();
      render(<DatePicker value="2026-03-01" onChange={onChange} />);

      const user = userEvent.setup();
      await user.click(screen.getByRole("button"));

      const day = await screen.findByText("15");
      await user.click(day);

      expect(onChange).toHaveBeenCalledWith("2026-03-15");
    });

    it("disables days outside min/max", async () => {
      mockPointer(false);
      render(
        <DatePicker
          value="2026-03-15"
          onChange={vi.fn()}
          min="2026-03-10"
          max="2026-03-20"
        />,
      );

      const user = userEvent.setup();
      await user.click(screen.getByRole("button"));

      // `showOutsideDays` also renders neighbouring months' "5", and the
      // trigger button's own accessible name already contains "15 Maret
      // 2026" plain — anchor on the day cell's full aria-label shape
      // ("<weekday>, <day> <month> <year>[, selected]") to get the one
      // unambiguous March cell.
      const beforeMin = await screen.findByRole("button", {
        name: /, 5 Maret 2026/,
      });
      const withinRange = screen.getByRole("button", {
        name: /, 15 Maret 2026/,
      });

      expect(beforeMin).toBeDisabled();
      expect(withinRange).not.toBeDisabled();
    });

    it("shows the placeholder when value is empty", () => {
      mockPointer(false);
      render(<DatePicker value="" onChange={vi.fn()} />);
      expect(screen.getByText("Pilih tanggal")).toBeInTheDocument();
    });

    it("keeps id on the trigger so FieldLabel htmlFor keeps working", () => {
      mockPointer(false);
      render(<DatePicker id="dob" value="" onChange={vi.fn()} />);
      expect(screen.getByRole("button")).toHaveAttribute("id", "dob");
    });
  });

  describe("coarse pointer", () => {
    it("renders a native input[type=date] and forwards its change", () => {
      mockPointer(true);
      const onChange = vi.fn();
      render(<DatePicker id="dob" value="2026-03-01" onChange={onChange} />);

      const input = screen.getByDisplayValue("2026-03-01") as HTMLInputElement;
      expect(input).toHaveAttribute("type", "date");
      expect(input).toHaveAttribute("id", "dob");

      fireEvent.change(input, { target: { value: "2026-04-10" } });
      expect(onChange).toHaveBeenCalledWith("2026-04-10");
    });

    it("forwards min/max to the native input", () => {
      mockPointer(true);
      render(
        <DatePicker
          value=""
          onChange={vi.fn()}
          min="2026-03-10"
          max="2026-03-20"
        />,
      );
      // jsdom doesn't expose a distinct accessible role for input[type=date],
      // so query by type instead.
      const dateInput = document.querySelector('input[type="date"]')!;
      expect(dateInput).toHaveAttribute("min", "2026-03-10");
      expect(dateInput).toHaveAttribute("max", "2026-03-20");
    });
  });

  it("responds to a matchMedia change after mount", async () => {
    const listeners: Array<() => void> = [];
    let coarse = false;
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query: string) =>
        ({
          get matches() {
            return coarse && query.includes("coarse");
          },
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: (_: string, cb: () => void) => listeners.push(cb),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }) as unknown as MediaQueryList,
    );

    render(<DatePicker value="" onChange={vi.fn()} />);
    expect(document.querySelector('input[type="date"]')).not.toBeInTheDocument();

    coarse = true;
    listeners.forEach((cb) => cb());

    await waitFor(() =>
      expect(document.querySelector('input[type="date"]')).toBeInTheDocument(),
    );
  });
});
