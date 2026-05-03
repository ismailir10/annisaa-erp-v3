import "@testing-library/jest-dom";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// next/cache APIs (revalidateTag, revalidatePath, unstable_cache) throw when
// called outside a Next.js request context. Stub them globally so any test
// that exercises code calling these functions (e.g. recordAudit → revalidateTag)
// doesn't fail with "static generation store missing".
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  unstable_cache: vi.fn((fn: unknown) => fn),
}));

// jsdom does not implement scrollIntoView — stub it globally so components that
// call it on mount (e.g. PortalTabs) don't throw in the test environment.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(Element.prototype as any).scrollIntoView = vi.fn();

// Cleanup after each test
afterEach(() => {
  cleanup();
});
