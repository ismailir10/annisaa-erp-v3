import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { TalibWordmark } from "../talib-wordmark";

describe("TalibWordmark", () => {
  it("renders the product name", () => {
    render(<TalibWordmark />);
    expect(screen.getByText("Talib")).toBeInTheDocument();
  });

  it("renders the parent-org sub-label by default", () => {
    render(<TalibWordmark />);
    expect(screen.getByText(/by An Nisaa' Sekolahku/)).toBeInTheDocument();
  });

  it("hides the sub-label when showSublabel is false", () => {
    render(<TalibWordmark showSublabel={false} />);
    expect(screen.queryByText(/by An Nisaa' Sekolahku/)).toBeNull();
  });

  it("applies the size variant class", () => {
    const { container } = render(<TalibWordmark size="lg" />);
    expect(container.firstChild).toHaveClass("text-2xl");
  });
});
