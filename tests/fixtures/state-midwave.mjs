// A hand-built game state in the middle of wave 20, shaped exactly as contract.js describes.
// The renderer draws it before the simulation exists, and a test checks a real mid-wave state has the same keys.
import { MAP, TILE, TOWERS, TOWER_ORDER } from '../../src/core/data.js';

const path = MAP.waypoints.map(([col, row]) => ({ x: col * TILE + TILE / 2, y: row * TILE + TILE / 2 }));
let pathLength = 0;
for (let i = 1; i < path.length; i++) pathLength += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);

const towerSpots = [
  [4, 5], [7, 3], [3, 8], [6, 12], [9, 14], [13, 8], [15, 4], [16, 9], [9, 7],
  [22, 8], [25, 6], [26, 12], [22, 12], [24, 16], [12, 18], [3, 14], [18, 16], [13, 5],
];

// Gold a tower of this type and tier has cost, so the sell button shows the real refund.
const spentOn = (type, tier) => TOWERS[type].cost + TOWERS[type].tiers.slice(1, tier + 1).reduce((total, next) => total + next.cost, 0);

const towers = towerSpots.map(([col, row], i) => ({
  id: i + 1,
  type: TOWER_ORDER[i % TOWER_ORDER.length],
  tier: i % 4,
  col,
  row,
  x: col * TILE + TILE / 2,
  y: row * TILE + TILE / 2,
  angle: (i * 0.7) % (Math.PI * 2),
  attackAnim: (i % 3) * 0.1,
  targetId: null,
  targeting: 'first',
  spent: spentOn(TOWER_ORDER[i % TOWER_ORDER.length], i % 4),
}));

const enemy = (id, type, x, y, hp, maxHp, extra = {}) => ({
  id, type, mods: { armoured: false, warded: false }, x, y, prevX: x - 1, prevY: y,
  hp, maxHp, progress: x, slow: 0, frozenFor: 0, dir: 1, ...extra,
});

const enemies = [
  enemy(101, 'chicken', 80, 112, 6, 6),
  enemy(102, 'goblin', 176, 200, 9, 14, { slow: 0.4 }),
  enemy(103, 'cow', 176, 300, 30, 30),
  enemy(104, 'imp', 120, 336, 4, 10),
  enemy(105, 'guard', 80, 420, 60, 80, { mods: { armoured: true, warded: false } }),
  enemy(106, 'hillGiant', 200, 528, 120, 120, { frozenFor: 0.6 }),
  enemy(107, 'bogGiant', 368, 400, 150, 200, { mods: { armoured: false, warded: true } }),
  enemy(108, 'blackKnight', 368, 250, 220, 220, { mods: { armoured: true, warded: true } }),
  enemy(109, 'fireGiant', 470, 208, 300, 450),
  enemy(110, 'dragonBlue', 560, 400, 2600, 4000, { dir: 1 }),
];

const projectiles = [
  { id: 201, kind: 'arrow', x: 130, y: 180, prevX: 125, prevY: 182, angle: 0.3 },
  { id: 202, kind: 'bolt', x: 300, y: 260, prevX: 295, prevY: 258, angle: -0.2 },
  { id: 203, kind: 'spell-air', x: 420, y: 300, prevX: 418, prevY: 300, angle: 0 },
  { id: 204, kind: 'spell-water', x: 440, y: 320, prevX: 438, prevY: 320, angle: 0 },
  { id: 205, kind: 'spell-earth', x: 460, y: 340, prevX: 458, prevY: 340, angle: 0 },
  { id: 206, kind: 'spell-fire', x: 480, y: 360, prevX: 478, prevY: 360, angle: 0 },
  { id: 207, kind: 'frost', x: 520, y: 380, prevX: 516, prevY: 380, angle: 0 },
  { id: 208, kind: 'storm', x: 600, y: 300, prevX: 596, prevY: 300, angle: 1.2 },
];

const events = [
  { type: 'hit', x: 176, y: 200, amount: 5, damageType: 'melee', enemyId: 102 },
  { type: 'hit', x: 80, y: 420, amount: 1, damageType: 'melee', enemyId: 105 },
  { type: 'hit', x: 368, y: 400, amount: 0, damageType: 'magic', enemyId: 107 },
  { type: 'kill', x: 240, y: 112, amount: 3, enemyId: 99 },
  { type: 'payout', x: 400, y: 592, amount: 120, towerId: 6 },
  { type: 'freeze', x: 200, y: 528, enemyId: 106 },
];

export const midWaveState = {
  seed: 1,
  gold: 2345,
  lives: 87,
  wave: 20,
  phase: 'wave',
  time: 1234.5,
  map: {
    cols: MAP.terrain[0].length,
    rows: MAP.terrain.length,
    tileSize: TILE,
    terrain: MAP.terrain,
    path,
    pathLength,
    slots: towerSpots.map(([col, row], i) => ({ col, row, score: 100 - i })),
  },
  towers,
  enemies,
  projectiles,
  events,
};
