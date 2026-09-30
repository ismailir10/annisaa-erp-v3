import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BlurText } from "../blur-text";

describe("BlurText", () => {
  it("exposes the full text as the accessible name of the chosen heading", () => {
    render(<BlurText as="h2" text="Sahabat belajar anak" className="text-h1" />);
    const heading = screen.getByRole("heading", { level: 2, name: "Sahabat belajar anak" });
    expect(heading).toBeTruthy();
    expect(heading.className).toContain("text-h1");
  });

  it("resolves the full text to exactly one element (the sr-only span)", () => {
    render(<BlurText text="Sahabat belajar anak" />);
    const el = screen.getByText("Sahabat belajar anak");
    expect(el.className).toContain("sr-only");
  });

  it("renders aria-hidden word spans with staggered animation delays", () => {
    const { container } = render(<BlurText text="Sahabat belajar anak" />);
    const words = container.querySelectorAll<HTMLElement>('[aria-hidden="true"] > span');
    expect(words).toHaveLength(3);
    words.forEach((w) => expect(w.className).toContain("motion-safe:animate-blur-in"));
    expect(Array.from(words).map((w) => w.style.animationDelay)).toEqual(["0ms", "90ms", "180ms"]);
  });

  it("honours custom delay and stagger", () => {
    const { container } = render(<BlurText text="Sahabat belajar anak" delay={200} stagger={50} />);
    const words = container.querySelectorAll<HTMLElement>('[aria-hidden="true"] > span');
    expect(Array.from(words).map((w) => w.style.animationDelay)).toEqual(["200ms", "250ms", "300ms"]);
  });

  it("collapses extra whitespace into two words", () => {
    const { container } = render(<BlurText text="  a   b " />);
    expect(container.querySelectorAll('[aria-hidden="true"] > span')).toHaveLength(2);
  });
});
