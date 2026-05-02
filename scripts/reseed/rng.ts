/**
 * Tiny seeded PRNG (mulberry32). Used to make reseed runs reproducible.
 * Not cryptographic — do NOT use for passwords or tokens.
 */
export function createRng(seed: number): {
  next: () => number;
  int: (min: number, max: number) => number;
  pick: <T>(arr: readonly T[]) => T;
  bool: (probability: number) => boolean;
} {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => Math.floor(next() * (max - min + 1)) + min,
    pick: (arr) => arr[Math.floor(next() * arr.length)]!,
    bool: (probability) => next() < probability,
  };
}
