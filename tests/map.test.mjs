import test from 'node:test';
import assert from 'node:assert/strict';
import { MAP, TILE } from '../src/core/data.js';
import { buildMap, isBuildable } from '../src/core/map.js';
import { REFERENCE_GENOME } from '../src/core/policy.js';

const map = buildMap();

test('the path starts off the west edge and ends at the castle gate, at tile centres', () => {
  assert.deepEqual(map.path[0], { x: -TILE / 2, y: 3 * TILE + TILE / 2 });
  assert.deepEqual(map.path[map.path.length - 1], { x: 26 * TILE + TILE / 2, y: 6 * TILE + TILE / 2 });
  assert.equal(map.path.length, MAP.waypoints.length);
});

test('the path length is the sum of its segments, 78 tiles for Millford', () => {
  assert.equal(map.pathLength, 78 * TILE);
});

test('the map copies the size and terrain from the data', () => {
  assert.equal(map.cols, 30);
  assert.equal(map.rows, 20);
  assert.equal(map.tileSize, TILE);
  assert.deepEqual(map.terrain, MAP.terrain);
});

test('only grass off the path is a slot, and slots are ranked best first', () => {
  assert.ok(map.slots.length > 100);
  for (const slot of map.slots) assert.equal(MAP.terrain[slot.row][slot.col], '.');
  for (let i = 1; i < map.slots.length; i++) assert.ok(map.slots[i - 1].score >= map.slots[i].score);
  assert.ok(map.slots[0].score > map.slots[map.slots.length - 1].score);
});

test('slot scores count the path length within two and a half tiles', () => {
  const best = map.slots[0];
  const centreX = best.col * TILE + TILE / 2;
  const centreY = best.row * TILE + TILE / 2;
  let covered = 0;
  for (let progress = 0; progress < map.pathLength; progress += 1) {
    let remaining = progress;
    for (let i = 1; i < map.path.length; i++) {
      const length = Math.hypot(map.path[i].x - map.path[i - 1].x, map.path[i].y - map.path[i - 1].y);
      if (remaining <= length) {
        const t = remaining / length;
        const x = map.path[i - 1].x + (map.path[i].x - map.path[i - 1].x) * t;
        const y = map.path[i - 1].y + (map.path[i].y - map.path[i - 1].y) * t;
        if (Math.hypot(x - centreX, y - centreY) <= 2.5 * TILE) covered += 1;
        break;
      }
      remaining -= length;
    }
  }
  assert.ok(Math.abs(covered - best.score) <= 8, `counted ${covered}, map says ${best.score}`);
});

test('isBuildable allows grass and refuses path, water, trees, rocks, buildings, fences, marsh and off-map tiles', () => {
  assert.equal(isBuildable(map, 13, 3), false);
  assert.equal(isBuildable(map, 14, 17), false);
  assert.equal(isBuildable(map, 26, 17), false);
  assert.equal(isBuildable(map, 0, 19), false);
  assert.equal(isBuildable(map, 24, 6), false);
  assert.equal(isBuildable(map, 0, 2), true);
  assert.equal(isBuildable(map, 5, 5), false);
  assert.equal(isBuildable(map, 19, 5), false);
  assert.equal(isBuildable(map, 0, 0), false);
  assert.equal(isBuildable(map, 16, 2), false);
  assert.equal(isBuildable(map, 28, 9), false);
  assert.equal(isBuildable(map, -1, 3), false);
  assert.equal(isBuildable(map, 30, 3), false);
});

test('every slot the reference build names exists on the map', () => {
  const highest = Math.max(...REFERENCE_GENOME.map((gene) => gene.slot));
  assert.ok(highest < map.slots.length, `slot ${highest} but only ${map.slots.length} slots`);
});
