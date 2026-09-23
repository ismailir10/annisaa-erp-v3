/**
 * T4 — "Jadikan wali utama" action on the guardian card.
 *
 * The action is the one-click alternative to the Wali Utama switch buried in
 * the Edit Wali form. It must appear only where promoting makes sense: a
 * non-primary, ACTIVE guardian, and only when the caller opted in by passing
 * `onSetPrimary`.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { GuardianDetailCard, type GuardianCardData } from "../guardian-detail-card";

function makeGuardian(overrides: Partial<GuardianCardData> = {}): GuardianCardData {
  return {
    id: "sg1",
    relationship: "AYAH",
    isPrimary: false,
    childOrder: null,
    status: "ACTIVE",
    parent: {
      id: "p1",
      name: "Pak Budi",
      phone: "08111",
      email: "budi@x.com",
      whatsapp: "08111",
      nik: null,
      education: null,
      occupation: null,
      employer: null,
      employerAddress: null,
      employerCity: null,
      incomeRange: null,
      childrenTotal: null,
      address: null,
      hasKtp: false,
      hasKk: false,
    },
    ...overrides,
  };
}

describe("GuardianDetailCard — Jadikan wali utama (T4)", () => {
  it("renders the action for a non-primary ACTIVE guardian when onSetPrimary is passed", () => {
    render(<GuardianDetailCard guardian={makeGuardian()} onSetPrimary={vi.fn()} />);
    // Named per guardian, like its Edit/Nonaktifkan siblings — a student with
    // two non-primary guardians shows two of these side by side.
    expect(screen.getByRole("button", { name: "Jadikan Pak Budi wali utama" })).toBeInTheDocument();
  });

  it("is absent for a primary guardian", () => {
    render(
      <GuardianDetailCard guardian={makeGuardian({ isPrimary: true })} onSetPrimary={vi.fn()} />,
    );
    expect(screen.queryByRole("button", { name: /^Jadikan .+ wali utama$/ })).not.toBeInTheDocument();
  });

  it("is absent for an INACTIVE guardian", () => {
    render(
      <GuardianDetailCard guardian={makeGuardian({ status: "INACTIVE" })} onSetPrimary={vi.fn()} />,
    );
    expect(screen.queryByRole("button", { name: /^Jadikan .+ wali utama$/ })).not.toBeInTheDocument();
  });

  it("is absent when the prop is omitted", () => {
    render(<GuardianDetailCard guardian={makeGuardian()} />);
    expect(screen.queryByRole("button", { name: /^Jadikan .+ wali utama$/ })).not.toBeInTheDocument();
  });

  it("calls onSetPrimary with the guardian when clicked", async () => {
    const user = userEvent.setup();
    const onSetPrimary = vi.fn();
    const guardian = makeGuardian();
    render(<GuardianDetailCard guardian={guardian} onSetPrimary={onSetPrimary} />);

    await user.click(screen.getByRole("button", { name: /^Jadikan .+ wali utama$/ }));

    expect(onSetPrimary).toHaveBeenCalledTimes(1);
    expect(onSetPrimary).toHaveBeenCalledWith(guardian);
  });
});
