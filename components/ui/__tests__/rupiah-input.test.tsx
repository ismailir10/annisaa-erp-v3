/**
 * RupiahInput — money input with a muted "Rp" adornment, id-ID thousands
 * separators while typing, and an integer (or `null` when empty) emitted to
 * `onChange`. Negative numbers are not supported.
 */
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RupiahInput } from "../rupiah-input";

function Harness({
  onValue,
  initial = null,
}: {
  onValue?: (value: number | null) => void;
  initial?: number | null;
}) {
  const [value, setValue] = useState<number | null>(initial);
  return (
    <RupiahInput
      aria-label="Nominal"
      value={value}
      onChange={(v) => {
        setValue(v);
        onValue?.(v);
      }}
    />
  );
}

describe("RupiahInput", () => {
  it("shows id-ID thousands separators while typing and emits the integer", async () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    const input = screen.getByRole("textbox", { name: "Nominal" });

    const user = userEvent.setup();
    await user.type(input, "1500000");

    expect(input).toHaveValue("1.500.000");
    expect(onValue).toHaveBeenLastCalledWith(1500000);
  });

  it("emits null when the field is cleared", async () => {
    const onValue = vi.fn();
    render(<Harness initial={5000} onValue={onValue} />);
    const input = screen.getByRole("textbox", { name: "Nominal" });
    expect(input).toHaveValue("5.000");

    const user = userEvent.setup();
    await user.clear(input);

    expect(input).toHaveValue("");
    expect(onValue).toHaveBeenLastCalledWith(null);
  });

  it("strips a pasted 'Rp 2.000' down to digits and emits 2000", async () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    const input = screen.getByRole("textbox", { name: "Nominal" });

    const user = userEvent.setup();
    await user.click(input);
    await user.paste("Rp 2.000");

    expect(input).toHaveValue("2.000");
    expect(onValue).toHaveBeenLastCalledWith(2000);
  });

  it("never emits a negative number — non-digit characters are stripped", async () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    const input = screen.getByRole("textbox", { name: "Nominal" });

    const user = userEvent.setup();
    await user.type(input, "-500");

    expect(input).toHaveValue("500");
    expect(onValue).toHaveBeenLastCalledWith(500);
  });

  it("renders the muted 'Rp' adornment", () => {
    render(<Harness />);
    expect(screen.getByText("Rp")).toBeInTheDocument();
  });

  it("clamps to Number.MAX_SAFE_INTEGER", async () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    const input = screen.getByRole("textbox", { name: "Nominal" });

    const user = userEvent.setup();
    await user.type(input, "99999999999999999999");

    expect(onValue).toHaveBeenLastCalledWith(Number.MAX_SAFE_INTEGER);
  });
});
