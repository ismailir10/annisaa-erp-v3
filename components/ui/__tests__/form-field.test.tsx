import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";

describe("FormField", () => {
  it("renders on top of Field primitives", () => {
    const { container } = render(
      <FormField label="Nama" required help="Sesuai akta">
        <Input required />
      </FormField>,
    );

    expect(container.querySelector('[data-slot="field"]')).toBeInTheDocument();
    expect(screen.getByText("Nama")).toHaveAttribute("data-slot", "field-label");
    expect(screen.getByText("Sesuai akta")).toHaveAttribute(
      "data-slot",
      "field-description",
    );
  });

  it("renders errors through FieldError", () => {
    render(
      <FormField label="Email" error="Format email tidak valid">
        <Input aria-invalid="true" />
      </FormField>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Format email tidak valid",
    );
  });
});
