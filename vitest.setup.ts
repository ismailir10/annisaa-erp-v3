import { vi } from "vitest";

// Shared setup — loaded by BOTH the `node` and the `jsdom` project, so nothing
// in here may touch `window` or `document`. DOM-only setup lives in
// vitest.setup.dom.ts.

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
