import { afterEach, describe, expect, it } from "vitest";
import {
  _checkRateLimitForTest,
  _resetRateLimitStore,
} from "../rate-limit";

afterEach(() => _resetRateLimitStore());

describe("checkRateLimit", () => {
  it("under-limit: returns ok=true with decreasing remaining count", () => {
    const t = () => 1000;
    const r1 = _checkRateLimitForTest(
      { key: "1.2.3.4", scope: "oauth_callback", limit: 3, windowMs: 60_000 },
      t,
    );
    const r2 = _checkRateLimitForTest(
      { key: "1.2.3.4", scope: "oauth_callback", limit: 3, windowMs: 60_000 },
      t,
    );
    const r3 = _checkRateLimitForTest(
      { key: "1.2.3.4", scope: "oauth_callback", limit: 3, windowMs: 60_000 },
      t,
    );
    expect(r1).toEqual({ ok: true, remaining: 2 });
    expect(r2).toEqual({ ok: true, remaining: 1 });
    expect(r3).toEqual({ ok: true, remaining: 0 });
  });

  it("over-limit: 4th call within window rejects with retryAfterMs", () => {
    const t = () => 1000;
    for (let i = 0; i < 3; i++) {
      _checkRateLimitForTest(
        {
          key: "1.2.3.4",
          scope: "oauth_callback",
          limit: 3,
          windowMs: 60_000,
        },
        t,
      );
    }
    const r = _checkRateLimitForTest(
      { key: "1.2.3.4", scope: "oauth_callback", limit: 3, windowMs: 60_000 },
      t,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.retryAfterMs).toBe(60_000);
  });

  it("window reset: after windowMs elapses, the bucket resets", () => {
    let now = 1000;
    const clock = () => now;
    for (let i = 0; i < 3; i++) {
      _checkRateLimitForTest(
        {
          key: "1.2.3.4",
          scope: "oauth_callback",
          limit: 3,
          windowMs: 60_000,
        },
        clock,
      );
    }
    // Verify we are over-limit before advancing the clock.
    const blocked = _checkRateLimitForTest(
      { key: "1.2.3.4", scope: "oauth_callback", limit: 3, windowMs: 60_000 },
      clock,
    );
    expect(blocked.ok).toBe(false);

    // Advance past window reset.
    now += 60_001;
    const r = _checkRateLimitForTest(
      { key: "1.2.3.4", scope: "oauth_callback", limit: 3, windowMs: 60_000 },
      clock,
    );
    expect(r).toEqual({ ok: true, remaining: 2 });
  });

  it("multi-key isolation: different keys in same scope have independent counters", () => {
    const t = () => 1000;
    for (let i = 0; i < 3; i++) {
      _checkRateLimitForTest(
        {
          key: "1.2.3.4",
          scope: "oauth_callback",
          limit: 3,
          windowMs: 60_000,
        },
        t,
      );
    }
    const r = _checkRateLimitForTest(
      { key: "5.6.7.8", scope: "oauth_callback", limit: 3, windowMs: 60_000 },
      t,
    );
    expect(r).toEqual({ ok: true, remaining: 2 });
  });

  it("multi-scope isolation: same key in different scopes has independent counters", () => {
    const t = () => 1000;
    for (let i = 0; i < 3; i++) {
      _checkRateLimitForTest(
        {
          key: "1.2.3.4",
          scope: "oauth_callback",
          limit: 3,
          windowMs: 60_000,
        },
        t,
      );
    }
    const r = _checkRateLimitForTest(
      { key: "1.2.3.4", scope: "demo_login", limit: 3, windowMs: 60_000 },
      t,
    );
    expect(r).toEqual({ ok: true, remaining: 2 });
  });

  it("retryAfterMs decreases as the window approaches reset", () => {
    let now = 1000;
    const clock = () => now;
    for (let i = 0; i < 3; i++) {
      _checkRateLimitForTest(
        {
          key: "1.2.3.4",
          scope: "oauth_callback",
          limit: 3,
          windowMs: 60_000,
        },
        clock,
      );
    }
    // 30s into the window — expect ~30s remaining.
    now += 30_000;
    const mid = _checkRateLimitForTest(
      { key: "1.2.3.4", scope: "oauth_callback", limit: 3, windowMs: 60_000 },
      clock,
    );
    expect(mid.ok).toBe(false);
    if (!mid.ok) expect(mid.retryAfterMs).toBe(30_000);
  });
});
