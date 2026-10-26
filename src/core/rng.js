// Seeded mulberry32. Everything random in the game goes through it, so a seed plus a genome always gives the same run.
export function createRng(seed) {
  let state = seed >>> 0;

  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  }

  return {
    next,
    int: (limit) => Math.floor(next() * limit),
    pick: (items) => items[Math.floor(next() * items.length)],
  };
}
