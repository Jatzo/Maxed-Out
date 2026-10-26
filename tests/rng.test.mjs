import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/core/rng.js';

const drawMany = (rng, count) => Array.from({ length: count }, () => rng.next());

test('the same seed gives the same sequence', () => {
  assert.deepEqual(drawMany(createRng(7), 50), drawMany(createRng(7), 50));
});

test('different seeds give different sequences', () => {
  assert.notDeepEqual(drawMany(createRng(7), 5), drawMany(createRng(8), 5));
});

test('next stays in the range 0 up to but not including 1 and averages near one half', () => {
  const values = drawMany(createRng(3), 10000);
  assert.ok(values.every((value) => value >= 0 && value < 1));
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  assert.ok(Math.abs(mean - 0.5) < 0.02, `mean was ${mean}`);
});

test('int returns whole numbers below the limit and reaches every value', () => {
  const rng = createRng(11);
  const seen = new Set();
  for (let i = 0; i < 500; i++) {
    const value = rng.int(6);
    assert.ok(Number.isInteger(value) && value >= 0 && value < 6);
    seen.add(value);
  }
  assert.equal(seen.size, 6);
});

test('pick returns members of the array and is repeatable', () => {
  const items = ['a', 'b', 'c'];
  const first = createRng(5);
  const second = createRng(5);
  for (let i = 0; i < 20; i++) {
    const chosen = first.pick(items);
    assert.ok(items.includes(chosen));
    assert.equal(chosen, second.pick(items));
  }
});
