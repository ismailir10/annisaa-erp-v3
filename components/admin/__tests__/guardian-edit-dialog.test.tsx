/**
 * Admin UI audit fixes (T2, finding #1) — see the doc comment in
 * `app/admin/students/__tests__/page.test.tsx` for why `getByLabelText` is a
 * meaningful assertion here: `components/ui/field.tsx`'s `FieldLabel` is a
 * sibling `<Label>`, not a wrapper, so pre-fix markup left every control
 * with no accessible name and every one of these lookups would throw.
 * `GuardianFormBody` now wires `htmlFor`/`id` pairs prefixed `guardian-`
 * (e.g. `guardian-name`, `guardian-relationship`).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { GuardianFormBody, EMPTY_GUARDIAN_FORM } from "../guardian-edit-dialog";

describe("GuardianFormBody — accessible names (AC1)", () => {
  it("resolves getByLabelText for representative fields when showRelationship is true (student-detail entry point)", () => {
    render(
      <GuardianFormBody form={EMPTY_GUARDIAN_FORM} setForm={vi.fn()} showRelationship />,
    );

    // Required field. The label's textContent includes a trailing
    // `aria-hidden` asterisk span ("Nama*"), so the query anchors on it
    // rather than requiring an exact string match.
    const nameInput = screen.getByLabelText(/^Nama\*?$/);
    expect(nameInput).toBeInTheDocument();
    expect(nameInput).toBeRequired();
    expect(nameInput).toHaveAttribute("aria-required", "true");

    // Plain Input.
    expect(screen.getByLabelText("No. HP")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();

    // shadcn <Select> — id lives on <SelectTrigger>.
    expect(screen.getByLabelText("Hubungan")).toBeInTheDocument();
    expect(screen.getByLabelText("Pendidikan")).toBeInTheDocument();

    // NIK + Jumlah Anak render in the showRelationship=true branch here —
    // both share an id with their showRelationship=false counterpart, but
    // the two branches are mutually exclusive within a single render.
    expect(screen.getByLabelText("NIK")).toBeInTheDocument();
    expect(screen.getByLabelText("Jumlah Anak")).toBeInTheDocument();

    // Junction fields (childOrder / isPrimary) only render in this branch.
    expect(screen.getByLabelText("Anak ke-")).toBeInTheDocument();
    // The Switch's underlying hidden checkbox is also `getByLabelText`-
    // resolvable via the same `htmlFor`/`id` pair (`guardian-primary`), but
    // Base UI additionally mirrors the label onto the visible
    // `role="switch"` element via a generated `aria-labelledby`, so two
    // elements now share the accessible name "Wali Utama". Query the
    // interactive switch directly instead to keep this assertion
    // unambiguous.
    expect(screen.getByRole("switch", { name: "Wali Utama" })).toBeInTheDocument();
  });

  it("resolves getByLabelText for the showRelationship=false branch (guardians list / detail entry points)", () => {
    render(
      <GuardianFormBody
        form={EMPTY_GUARDIAN_FORM}
        setForm={vi.fn()}
        showRelationship={false}
      />,
    );

    expect(screen.getByLabelText("NIK")).toBeInTheDocument();
    expect(screen.getByLabelText("Jumlah Anak")).toBeInTheDocument();
    expect(screen.queryByLabelText("Hubungan")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Anak ke-")).not.toBeInTheDocument();
  });
});
