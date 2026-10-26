import { MAP, TILE } from './data.js';

const SLOT_REACH_TILES = 2.5;

/**
 * Builds the playable map from the terrain and waypoints in data.js: the path in pixels, its length, and every
 * buildable tile ranked by how much of the path it can see.
 * @returns {import('./contract.js').GameMap}
 */
export function buildMap() {
  const path = MAP.waypoints.map(([col, row]) => ({ x: col * TILE + TILE / 2, y: row * TILE + TILE / 2 }));
  let pathLength = 0;
  for (let i = 1; i < path.length; i++) pathLength += segmentLength(path, i);

  const map = {
    cols: MAP.terrain[0].length,
    rows: MAP.terrain.length,
    tileSize: TILE,
    terrain: MAP.terrain,
    path,
    pathLength,
    slots: [],
  };
  map.slots = rankSlots(map);
  return map;
}

export function isBuildable(map, col, row) {
  return col >= 0 && row >= 0 && col < map.cols && row < map.rows && map.terrain[row][col] === '.';
}

/**
 * One position per pixel of path walked, so the simulation can turn a progress value into a point without
 * searching the segments. Direction is -1 or 1 and follows the last horizontal movement.
 */
export function buildPathTable(map) {
  const size = Math.ceil(map.pathLength) + 2;
  const xs = new Float32Array(size);
  const ys = new Float32Array(size);
  const dirs = new Int8Array(size);
  let direction = 1;
  let segment = 1;
  let segmentStart = 0;
  let segmentEnd = segmentLength(map.path, 1);
  for (let progress = 0; progress < size; progress++) {
    while (progress > segmentEnd && segment < map.path.length - 1) {
      segment += 1;
      segmentStart = segmentEnd;
      segmentEnd += segmentLength(map.path, segment);
    }
    const from = map.path[segment - 1];
    const to = map.path[segment];
    if (to.x !== from.x) direction = to.x > from.x ? 1 : -1;
    const t = Math.min(1, (progress - segmentStart) / (segmentEnd - segmentStart));
    xs[progress] = from.x + (to.x - from.x) * t;
    ys[progress] = from.y + (to.y - from.y) * t;
    dirs[progress] = direction;
  }
  return { xs, ys, dirs, size };
}

function segmentLength(path, index) {
  return Math.hypot(path[index].x - path[index - 1].x, path[index].y - path[index - 1].y);
}

function rankSlots(map) {
  const table = buildPathTable(map);
  const reach = SLOT_REACH_TILES * TILE;
  const slots = [];
  for (let row = 0; row < map.rows; row++) {
    for (let col = 0; col < map.cols; col++) {
      if (!isBuildable(map, col, row)) continue;
      const centreX = col * TILE + TILE / 2;
      const centreY = row * TILE + TILE / 2;
      let score = 0;
      for (let progress = 0; progress < map.pathLength; progress++) {
        if (Math.hypot(table.xs[progress] - centreX, table.ys[progress] - centreY) <= reach) score += 1;
      }
      slots.push({ col, row, score });
    }
  }
  // Array.prototype.sort is stable, so equal scores stay in reading order and the ranking never shifts between runs.
  return slots.sort((a, b) => b.score - a.score);
}
