import "@testing-library/jest-dom";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// next/cache APIs (revalidateTag, revalidatePath, unstable_cache) throw when
// called outside a Next.js request context. Stub them globally so any test
// that exercises code calling these functions (e.g. recordAudit → revalidateTag)
// doesn't fail with "static generation store missing".
//
// IMPORTANT: cache memoisation is intentionally bypassed here. Tests that need
// to verify caching behaviour (e.g. asserting two consecutive calls share a
// memoised result) should re-mock next/cache locally with a spy wrapper that
// preserves call counting. The same caveat applies to any test that wants to
// verify revalidatePath was NOT called prematurely.
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  unstable_cache: vi.fn((fn: unknown) => fn),
}));

// jsdom does not implement scrollIntoView — stub it globally so components that
// call it on mount (e.g. PortalTabs) don't throw in the test environment.
// Guard for node-env tests (e.g. server-route tests) where `Element` is undefined.
if (typeof Element !== "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Element.prototype as any).scrollIntoView = vi.fn();
}

// Cleanup after each test
afterEach(() => {
  cleanup();
});
