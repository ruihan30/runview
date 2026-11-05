// Seeded random numbers, so the same seed always produces the same run.

export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Float in [min, max). */
  range(min: number, max: number): number;
  /** Integer in [min, max], inclusive. */
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  chance(probability: number): boolean;
  /** Lowercase hex string of the given length. */
  hex(length: number): string;
}

/** mulberry32: small, fast, good enough for test data. */
export function createRng(seed: number): Rng {
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
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    pick: (items) => {
      if (items.length === 0) throw new Error("pick() needs at least one item");
      return items[Math.floor(next() * items.length)];
    },
    chance: (probability) => next() < probability,
    hex: (length) => {
      let out = "";
      for (let i = 0; i < length; i++) out += Math.floor(next() * 16).toString(16);
      return out;
    },
  };
}
