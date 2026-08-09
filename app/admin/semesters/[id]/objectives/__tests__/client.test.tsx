/**
 * Admin UI audit fixes (T8, finding #11) — the edit (Pencil) and reactivate
 * (RotateCcw) controls on each IKTP row were icon-only `<Button>`s with no
 * text and no `aria-label`, so a screen reader announced only "button" for
 * every row on the page. `getByRole("button", { name })` only resolves
 * through a real accessible name (aria-label, aria-labelledby, or text
 * content) — against the pre-fix markup these queries would throw
 * `Unable to find an accessible element with the role "button" and name`.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { IndicatorRow } from "../client";

const activeIndicator = {
  id: "ind-1",
  objectiveId: "obj-1",
  content: "Anak mampu menyebutkan angka 1-10",
  order: 3,
  status: "ACTIVE",
};

const inactiveIndicator = {
  ...activeIndicator,
  id: "ind-2",
  order: 5,
  status: "INACTIVE",
};

describe("IndicatorRow — icon-only button accessible names (AC11)", () => {
  it("names the edit control after the specific IKTP it acts on", () => {
    render(
      <IndicatorRow
        indicator={activeIndicator}
        themes={[]}
        canWrite
        currentLinks={[]}
        onChanged={vi.fn()}
        onLinkToggle={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Ubah IKTP #3" }),
    ).toBeInTheDocument();
  });

  it("names the reactivate control after the specific inactive IKTP it acts on", () => {
    render(
      <IndicatorRow
        indicator={inactiveIndicator}
        themes={[]}
        canWrite
        currentLinks={[]}
        onChanged={vi.fn()}
        onLinkToggle={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Aktifkan IKTP #5" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Ubah IKTP #5" }),
    ).toBeInTheDocument();
  });
});
