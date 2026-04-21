import "@testing-library/jest-dom";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// jsdom does not implement scrollIntoView — stub it globally so components that
// call it on mount (e.g. PortalTabs) don't throw in the test environment.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(Element.prototype as any).scrollIntoView = vi.fn();

// Cleanup after each test
afterEach(() => {
  cleanup();
});
