import test from 'node:test';
import assert from 'node:assert/strict';
import { TOWERS } from '../src/core/data.js';
import { WEAPONS, WEAPON_SAFE_AREA } from '../src/render/sprites.js';

test('every weapon pixel stays inside the area a tier 3 tower can draw', () => {
  const { left, right, top, bottom } = WEAPON_SAFE_AREA;
  const outside = [];
  for (const [name, poses] of Object.entries(WEAPONS)) {
    for (const [pose, pieces] of Object.entries(poses)) {
      for (const [key, x, y, width, height] of pieces) {
        if (x < left || x + width - 1 > right || y < top || y + height - 1 > bottom) outside.push(`${name} ${pose} ${key} at ${x},${y}`);
      }
    }
  }
  assert.deepEqual(outside, []);
});

test('every tier names a weapon that can be drawn, and every weapon is used', () => {
  const used = new Set(Object.values(TOWERS).flatMap((tower) => tower.tiers.map((tier) => tier.outfit.weapon)));
  for (const weapon of used) assert.ok(weapon in WEAPONS, `${weapon} has no drawing`);
  for (const weapon of Object.keys(WEAPONS)) assert.ok(used.has(weapon), `${weapon} is drawn but no tier uses it`);
});
