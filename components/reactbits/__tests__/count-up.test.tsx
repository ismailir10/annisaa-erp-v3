import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CountUp } from "../count-up";

/** IntersectionObserver that reports every observed element as visible right away. */
class VisibleObserver {
  constructor(private cb: (entries: unknown[]) => void) {}
  observe(target: Element) {
    this.cb([{ isIntersecting: true, target, intersectionRatio: 1 }]);
  }
  unobserve() {}
  disconnect() {}
}

function stubReducedMotion() {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(prefers-reduced-motion: reduce)",
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CountUp", () => {
  it("renders a bare text node when IntersectionObserver is unavailable", () => {
    render(
      <p data-testid="p">
        <CountUp value={101} />
      </p>,
    );
    expect(screen.getByText("101")).toBe(screen.getByTestId("p"));
    expect(document.querySelector("[aria-hidden]")).toBeNull();
  });

  it("renders a bare text node under reduced motion", () => {
    vi.stubGlobal("IntersectionObserver", VisibleObserver);
    stubReducedMotion();
    render(
      <p data-testid="p">
        <CountUp value={1234} />
      </p>,
    );
    expect(screen.getByText("1234")).toBe(screen.getByTestId("p"));
    expect(document.querySelector("[aria-hidden]")).toBeNull();
  });

  it("animates to the final value with an sr-only copy for screen readers", async () => {
    vi.stubGlobal("IntersectionObserver", VisibleObserver);
    const { container } = render(
      <p data-testid="p">
        <CountUp value={42} duration={0.05} className="tabular-nums" />
      </p>,
    );
    const hidden = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    const sr = container.querySelector(".sr-only") as HTMLElement;
    expect(hidden).toHaveClass("tabular-nums");
    expect(sr).toHaveTextContent("42");
    // Settles back to a single bare text node: no ticking span, no sr-only twin.
    await waitFor(() => expect(screen.getByTestId("p").textContent).toBe("42"));
    expect(screen.getByText("42")).toBe(screen.getByTestId("p"));
    expect(container.querySelector("[aria-hidden]")).toBeNull();
  });

  it("keeps the decimal places of the value", async () => {
    vi.stubGlobal("IntersectionObserver", VisibleObserver);
    const { container } = render(
      <p data-testid="p">
        <CountUp value={2.5} duration={0.05} />
      </p>,
    );
    expect(container.querySelector(".sr-only")).toHaveTextContent("2.5");
    await waitFor(() => expect(screen.getByTestId("p").textContent).toBe("2.5"));
  });
});
