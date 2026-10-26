// Every character in the game is built here from small pixel pieces and cached on offscreen canvases.
// A piece is a list of rectangles [colour key, x, y, width, height] on a 16 pixel wide grid, so a
// tower is a body base with legs, body, cape, head and weapon pieces layered on top and tinted from
// the tier's colours. The grid is drawn at 2x, so one grid pixel is two screen pixels.
import { TOWERS, ENEMIES } from '../core/data.js';

const SCALE = 2;
const INK = '#1a1410';

// Towers: the 16 x 18 character sits inside a buffer with room for weapons and an outline.
const TOWER_BUFFER = { width: 24, height: 22, originX: 4, originY: 2 };

// Enemies keep three pixels of margin: one for the outline and two for the warded ring.
const ENEMY_MARGIN = 3;
// Where the feet sit below the enemy's position, as a fraction of its height, so the body is centred on the path.
const FEET_BELOW_CENTRE = 0.38;

function parse(hex) {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function mix(hex, target, amount) {
  const from = parse(hex);
  const to = parse(target);
  const channel = (index) => Math.round(from[index] + (to[index] - from[index]) * amount);
  return `#${[0, 1, 2].map((index) => channel(index).toString(16).padStart(2, '0')).join('')}`;
}

const darker = (hex, amount = 0.3) => mix(hex, '#000000', amount);
const lighter = (hex, amount = 0.3) => mix(hex, '#ffffff', amount);

const shift = (ops, dx, dy) => ops.map(([key, x, y, w, h]) => [key, x + dx, y + dy, w, h]);
const mirror = (ops, width) => ops.map(([key, x, y, w, h]) => [key, width - x - w, y, w, h]);

function makeGrid(width, height) {
  return { width, height, cells: new Array(width * height).fill(null) };
}

function paint(grid, ops, palette, originX, originY) {
  for (const [key, x, y, w, h] of ops) {
    const colour = palette[key];
    for (let row = y; row < y + h; row++) {
      for (let column = x; column < x + w; column++) {
        const gx = column + originX;
        const gy = row + originY;
        if (gx >= 0 && gy >= 0 && gx < grid.width && gy < grid.height) grid.cells[gy * grid.width + gx] = colour;
      }
    }
  }
}

function neighbourFilled(grid, x, y, filled) {
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
    const nx = x + dx;
    const ny = y + dy;
    return nx >= 0 && ny >= 0 && nx < grid.width && ny < grid.height && filled(grid.cells[ny * grid.width + nx]);
  });
}

// Grows a one pixel ring around everything already drawn. Returns the new cells without touching the grid.
function ring(grid, colour, filled) {
  const added = [];
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (grid.cells[y * grid.width + x] === null && neighbourFilled(grid, x, y, filled)) added.push([x, y]);
    }
  }
  for (const [x, y] of added) grid.cells[y * grid.width + x] = colour;
}

function toCanvas(grid) {
  const canvas = document.createElement('canvas');
  canvas.width = grid.width * SCALE;
  canvas.height = grid.height * SCALE;
  const ctx = canvas.getContext('2d');
  grid.cells.forEach((colour, index) => {
    if (!colour) return;
    ctx.fillStyle = colour;
    ctx.fillRect((index % grid.width) * SCALE, Math.floor(index / grid.width) * SCALE, SCALE, SCALE);
  });
  return canvas;
}

const isInk = (colour) => colour !== null;

// ---------------------------------------------------------------------------------------------
// Tower pieces
// ---------------------------------------------------------------------------------------------

const STRIPES = ['R', 'G', 'U', 'N', 'V', 'O'];

const BASE = [
  ['B', 5, 16, 3, 2], ['B', 8, 16, 3, 2],
  ['k', 4, 8, 8, 5], ['k', 3, 9, 1, 4], ['k', 12, 9, 1, 4],
  ['k', 6, 3, 4, 1], ['k', 5, 4, 6, 3], ['K', 6, 7, 4, 1],
  ['e', 6, 5, 1, 1], ['e', 9, 5, 1, 1],
];

const CAPES = {
  none: [],
  cape: [['a', 2, 8, 12, 9], ['A', 2, 16, 12, 1], ['A', 2, 8, 1, 9]],
  'cape-max': [
    ...STRIPES.map((key, index) => [key, 2 + index * 2, 8, 2, 9]),
    ['H', 2, 16, 12, 1],
  ],
};

const LEGS = {
  trousers: [['s', 5, 13, 6, 3], ['S', 8, 14, 1, 2]],
  chaps: [['s', 7, 13, 2, 3], ['p', 5, 13, 2, 3], ['p', 9, 13, 2, 3], ['P', 5, 15, 6, 1]],
  'robe-skirt': [['p', 4, 13, 8, 3], ['a', 4, 15, 8, 1], ['P', 7, 13, 2, 2]],
  'plate-legs': [['p', 5, 13, 6, 3], ['q', 5, 13, 1, 3], ['P', 10, 13, 1, 3], ['m', 5, 14, 2, 1], ['m', 9, 14, 2, 1], ['P', 8, 13, 1, 3]],
};

const BODIES = {
  vest: [['p', 4, 8, 3, 5], ['p', 9, 8, 3, 5], ['s', 4, 12, 8, 1], ['P', 4, 8, 1, 4]],
  leather: [['p', 4, 8, 8, 5], ['P', 4, 12, 8, 1], ['p', 3, 9, 1, 2], ['p', 12, 9, 1, 2], ['s', 6, 8, 4, 1]],
  hide: [
    ['p', 4, 8, 8, 5], ['P', 5, 9, 2, 1], ['P', 9, 9, 2, 1], ['P', 7, 11, 2, 1],
    ['p', 3, 9, 1, 3], ['p', 12, 9, 1, 3], ['s', 3, 11, 1, 1], ['s', 12, 11, 1, 1], ['s', 4, 12, 8, 1],
  ],
  robe: [
    ['p', 4, 8, 8, 5], ['p', 3, 9, 1, 4], ['p', 12, 9, 1, 4], ['s', 7, 8, 2, 5], ['a', 4, 12, 8, 1], ['P', 4, 8, 1, 4],
  ],
  plate: [
    ['p', 4, 8, 8, 5], ['m', 3, 8, 2, 2], ['m', 11, 8, 2, 2], ['q', 5, 9, 2, 2], ['s', 7, 9, 2, 3],
    ['p', 3, 10, 1, 2], ['p', 12, 10, 1, 2], ['a', 4, 12, 8, 1], ['P', 10, 9, 1, 3],
  ],
  chain: [
    ['p', 4, 8, 8, 5], ['m', 5, 9, 1, 1], ['m', 7, 9, 1, 1], ['m', 9, 9, 1, 1], ['m', 6, 10, 1, 1], ['m', 8, 10, 1, 1],
    ['m', 10, 10, 1, 1], ['m', 5, 11, 1, 1], ['m', 7, 11, 1, 1], ['m', 9, 11, 1, 1], ['p', 3, 9, 1, 2], ['p', 12, 9, 1, 2],
    ['s', 4, 12, 8, 1],
  ],
  torso: [
    ['p', 4, 8, 8, 5], ['p', 3, 8, 2, 3], ['p', 11, 8, 2, 3], ['a', 7, 9, 2, 2], ['P', 4, 11, 8, 1], ['s', 4, 12, 8, 1],
    ['p', 3, 11, 1, 1], ['p', 12, 11, 1, 1],
  ],
  tunic: [['p', 4, 8, 8, 5], ['p', 3, 9, 1, 2], ['p', 12, 9, 1, 2], ['s', 4, 12, 8, 1], ['a', 7, 9, 1, 1], ['a', 7, 11, 1, 1]],
};

const HEADS = {
  none: [['h', 6, 2, 4, 2], ['h', 5, 3, 1, 2], ['h', 10, 3, 1, 2]],
  bandana: [['h', 6, 2, 4, 1], ['a', 6, 3, 4, 1], ['a', 5, 4, 6, 1], ['A', 11, 4, 2, 1], ['A', 12, 5, 1, 2]],
  coif: [['p', 6, 2, 4, 1], ['p', 5, 3, 6, 2], ['q', 6, 2, 2, 1], ['P', 5, 5, 1, 3], ['P', 10, 5, 1, 3]],
  hood: [
    ['p', 7, 0, 2, 1], ['p', 6, 1, 4, 1], ['p', 5, 2, 6, 1], ['p', 4, 3, 8, 2], ['P', 6, 4, 4, 1],
    ['P', 4, 5, 2, 3], ['P', 10, 5, 2, 3], ['q', 7, 1, 1, 1],
  ],
  'wizard-hat': [
    ['p', 9, 0, 2, 1], ['p', 7, 1, 4, 1], ['a', 6, 2, 5, 1], ['P', 3, 3, 10, 1], ['w', 8, 1, 1, 1],
  ],
  'full-helm': [
    ['a', 7, 0, 2, 2], ['m', 6, 2, 4, 1], ['m', 5, 3, 6, 5], ['M', 5, 7, 6, 1], ['n', 6, 3, 1, 2], ['e', 6, 5, 4, 1],
  ],
  'horned-helm': [
    ['m', 5, 2, 6, 2], ['m', 5, 4, 1, 3], ['m', 10, 4, 1, 3], ['M', 7, 4, 2, 2], ['n', 5, 2, 2, 1],
    ['n', 4, 3, 1, 1], ['n', 3, 2, 1, 1], ['n', 3, 1, 1, 1], ['n', 11, 3, 1, 1], ['n', 12, 2, 1, 1], ['n', 12, 1, 1, 1],
  ],
  'party-hat': [
    ['m', 7, 0, 2, 1], ['a', 7, 1, 2, 1], ['a', 6, 2, 4, 1], ['p', 5, 3, 6, 1], ['p', 6, 2, 1, 1], ['p', 9, 2, 1, 1],
  ],
  crown: [
    ['h', 6, 3, 4, 1], ['m', 5, 2, 6, 1], ['m', 5, 1, 1, 1], ['m', 7, 1, 2, 1], ['m', 10, 1, 1, 1], ['a', 7, 2, 2, 1], ['n', 5, 2, 1, 1],
  ],
};

const SWORD_THRUST = [['m', 13, 10, 5, 1], ['n', 18, 10, 1, 1], ['a', 12, 9, 1, 3]];
const SWORD_BIG = [['m', 13, 2, 2, 9], ['n', 13, 2, 1, 9], ['n', 13, 1, 1, 1], ['a', 11, 11, 5, 1], ['B', 13, 12, 1, 2], ['a', 13, 14, 1, 1]];
const SHIELD = [['m', 0, 9, 4, 1], ['m', 0, 14, 4, 1], ['m', 0, 9, 1, 6], ['m', 3, 9, 1, 6], ['s', 1, 10, 2, 4], ['a', 1, 11, 2, 2]];
const DEFENDER = [['s', 1, 10, 3, 4], ['m', 1, 10, 3, 1], ['m', 1, 13, 3, 1], ['a', 2, 11, 1, 2]];
const STAFF_ORB = [['b', 13, 4, 1, 9], ['m', 12, 4, 3, 1], ['a', 12, 2, 3, 1], ['a', 13, 1, 1, 3], ['w', 13, 2, 1, 1]];
const STAFF = [['b', 13, 3, 1, 10], ['m', 12, 2, 3, 1], ['a', 13, 1, 1, 1]];
const BOW = [['b', 14, 5, 1, 1], ['b', 15, 6, 1, 6], ['b', 14, 12, 1, 1]];
const LONGBOW = [['b', 14, 2, 1, 1], ['b', 15, 3, 1, 1], ['b', 16, 4, 1, 9], ['b', 15, 13, 1, 1], ['b', 14, 14, 1, 1]];
const GREATBOW = [
  ['m', 14, 0, 1, 1], ['b', 15, 1, 1, 2], ['b', 16, 3, 1, 10], ['b', 15, 13, 1, 2], ['m', 14, 15, 1, 1], ['a', 16, 7, 1, 3],
];
const CROSSBOW = [['b', 11, 11, 5, 2], ['M', 15, 8, 1, 7], ['m', 15, 8, 1, 1], ['m', 15, 14, 1, 1]];
const SCYTHE = [['b', 14, 2, 1, 12], ['m', 10, 1, 5, 1], ['m', 9, 2, 2, 1], ['n', 9, 3, 1, 1], ['n', 10, 1, 3, 1]];
const AXE = [['b', 13, 3, 1, 10], ['m', 14, 2, 3, 4], ['n', 16, 2, 1, 4], ['M', 14, 5, 3, 1]];
const SACK = [['B', 13, 10, 3, 3], ['b', 13, 11, 3, 2], ['m', 13, 9, 3, 1], ['m', 14, 11, 1, 1]];

// Each weapon has a resting pose and a swung or cast pose, shown while attackAnim is under 0.15 seconds.
const WEAPONS = {
  sabre: {
    idle: [['m', 13, 4, 1, 8], ['n', 13, 3, 1, 2], ['a', 12, 11, 3, 1], ['B', 13, 12, 1, 1]],
    attack: [...SWORD_THRUST, ['B', 12, 12, 1, 1]],
  },
  maul: {
    idle: [['b', 13, 3, 1, 10], ['M', 10, 1, 6, 4], ['m', 11, 1, 4, 3], ['n', 11, 1, 4, 1]],
    attack: [['b', 13, 12, 1, 1], ['b', 14, 11, 1, 1], ['b', 15, 10, 1, 1], ['b', 16, 9, 1, 1], ['M', 15, 5, 4, 5], ['m', 16, 5, 2, 4], ['n', 16, 5, 2, 1]],
  },
  bow: {
    idle: [...BOW, ['w', 14, 6, 1, 6]],
    attack: [...BOW, ['w', 14, 6, 1, 3], ['w', 13, 9, 1, 1], ['w', 14, 10, 1, 2], ['B', 13, 9, 4, 1], ['m', 17, 9, 1, 1]],
  },
  longbow: {
    idle: [...LONGBOW, ['w', 15, 4, 1, 9]],
    attack: [...LONGBOW, ['w', 14, 5, 1, 3], ['w', 13, 8, 1, 1], ['w', 14, 9, 1, 4], ['B', 13, 8, 5, 1], ['m', 18, 8, 1, 1]],
  },
  crossbow: {
    idle: [...CROSSBOW, ['w', 14, 9, 1, 5]],
    attack: [...CROSSBOW, ['w', 14, 9, 1, 5], ['n', 16, 11, 2, 1]],
  },
  greatbow: {
    idle: [...GREATBOW, ['w', 14, 1, 1, 14]],
    attack: [...GREATBOW, ['w', 14, 1, 1, 7], ['w', 13, 8, 1, 1], ['w', 14, 9, 1, 6], ['B', 13, 8, 4, 1], ['m', 17, 8, 1, 1]],
  },
  staff: {
    idle: STAFF,
    attack: [...shift(STAFF, 0, -1), ['w', 11, 1, 1, 1], ['w', 15, 1, 1, 1], ['w', 13, 0, 1, 1]],
  },
  'staff-orb': {
    idle: STAFF_ORB,
    attack: [...shift(STAFF_ORB, 0, -1), ['w', 11, 0, 1, 1], ['w', 15, 0, 1, 1], ['w', 11, 2, 1, 1], ['w', 15, 2, 1, 1]],
  },
  'sword-shield': {
    idle: [...SHIELD, ['m', 13, 6, 1, 6], ['n', 13, 5, 1, 1], ['a', 12, 11, 3, 1], ['B', 13, 12, 1, 1]],
    attack: [...SHIELD, ...SWORD_THRUST, ['B', 12, 12, 1, 1]],
  },
  sword: {
    idle: SWORD_BIG,
    attack: [['m', 13, 9, 5, 2], ['n', 13, 9, 5, 1], ['n', 18, 10, 1, 1], ['a', 12, 8, 1, 5], ['B', 11, 10, 1, 1]],
  },
  'sword-defender': {
    idle: [...DEFENDER, ...SWORD_BIG],
    attack: [...DEFENDER, ['m', 13, 9, 5, 2], ['n', 13, 9, 5, 1], ['n', 18, 10, 1, 1], ['a', 12, 8, 1, 5]],
  },
  whip: {
    idle: [['B', 13, 11, 1, 2], ['m', 14, 10, 1, 1], ['m', 15, 9, 1, 1], ['m', 15, 8, 1, 1], ['m', 14, 7, 1, 1], ['m', 13, 6, 1, 1], ['a', 12, 6, 1, 1]],
    attack: [['B', 13, 11, 1, 2], ['m', 14, 10, 3, 1], ['m', 17, 9, 1, 1], ['a', 18, 8, 1, 1]],
  },
  scythe: {
    idle: SCYTHE,
    attack: [...shift(SCYTHE, 1, 1), ['w', 16, 4, 1, 3], ['w', 17, 7, 1, 3]],
  },
  axe: {
    idle: AXE,
    attack: [...shift(AXE, 2, 1), ['a', 16, 1, 1, 1], ['a', 17, 0, 1, 1]],
  },
  'coin-bag': {
    idle: SACK,
    attack: [...SACK, ['m', 14, 5, 2, 2], ['w', 14, 5, 1, 1], ['a', 13, 3, 1, 1], ['a', 16, 4, 1, 1]],
  },
};

// Higher tiers read as different characters at a glance: a buckle, then pauldrons, then a chest gem and a glow.
const BUCKLE = ['m', 7, 12, 2, 1];
const PAULDRONS = [['m', 2, 8, 2, 2], ['m', 12, 8, 2, 2], ['n', 2, 8, 2, 1], ['n', 12, 8, 2, 1]];
const FLAIR = [[], [BUCKLE], [BUCKLE, ...PAULDRONS], [BUCKLE, ...PAULDRONS, ['a', 7, 9, 2, 2]]];

function towerPalette(colours) {
  return {
    p: colours.primary, P: darker(colours.primary), q: lighter(colours.primary, 0.25),
    s: colours.secondary, S: darker(colours.secondary),
    m: colours.metal, M: darker(colours.metal, 0.35), n: lighter(colours.metal, 0.4),
    a: colours.accent, A: darker(colours.accent, 0.35),
    k: '#e0b080', K: '#b88458', e: INK, h: '#4a2f1a', b: '#8a5a2b', B: '#5c3d1e', w: '#f4efe0', H: '#3a2a1a',
    R: '#c0392b', G: '#e6c84f', U: '#2f6fb0', N: '#3e9a4a', V: '#7a3fa0', O: '#e8702a',
  };
}

const towerCache = new Map();

function buildTower(type, tier, attacking) {
  const { outfit } = TOWERS[type].tiers[tier];
  const palette = towerPalette(outfit.colours);
  const grid = makeGrid(TOWER_BUFFER.width, TOWER_BUFFER.height);
  const { originX, originY } = TOWER_BUFFER;
  const weapon = WEAPONS[outfit.weapon];
  for (const ops of [
    CAPES[outfit.cape], BASE, LEGS[outfit.legs], BODIES[outfit.body], FLAIR[tier], HEADS[outfit.head],
    attacking ? weapon.attack : weapon.idle,
  ]) {
    paint(grid, ops, palette, originX, originY);
  }
  ring(grid, INK, isInk);
  if (tier === 3) ring(grid, mix(outfit.colours.accent, '#1b1712', 0.45), isInk);
  return toCanvas(grid);
}

/** Size of a tower sprite and where its feet and centre sit, in screen pixels. */
export const TOWER_SPRITE = { width: TOWER_BUFFER.width * SCALE, height: TOWER_BUFFER.height * SCALE, feet: 40 };

export function towerSprite(type, tier, attacking = false) {
  const key = `${type}|${tier}|${attacking}`;
  if (!towerCache.has(key)) towerCache.set(key, buildTower(type, tier, attacking));
  return towerCache.get(key);
}

/** Draws a tower with its feet 14 pixels below (x, y), the centre of its tile. */
export function drawTower(ctx, type, tier, x, y, { attacking = false, flip = false } = {}) {
  const sprite = towerSprite(type, tier, attacking);
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y + 14 - TOWER_SPRITE.feet));
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(sprite, -TOWER_SPRITE.width / 2, 0);
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------
// Enemies
// ---------------------------------------------------------------------------------------------

const ENEMY_BASE_PALETTE = { e: INK, w: '#f4efe0', y: '#f0e050', m: '#d8dcdf', b: '#8a5a2b', B: '#5c3d1e' };

function knight(colours, weapon) {
  const palette = {
    p: colours.plate, P: darker(colours.plate), q: lighter(colours.plate, 0.25), s: colours.tabard, a: colours.plume,
    r: colours.eye,
  };
  return {
    width: 16, height: 15, palette,
    draw: (f) => [
      ...shift([
        ['a', 7, 0, 2, 2], ['p', 5, 1, 6, 6], ['q', 5, 1, 1, 5], ['r', 6, 4, 4, 1], ['P', 6, 6, 4, 1],
        ['p', 3, 7, 3, 2], ['p', 10, 7, 3, 2], ['p', 4, 8, 8, 4], ['s', 6, 8, 4, 5], ['P', 4, 11, 8, 1],
        ['p', 3, 9, 1, 3], ['p', 12, 9, 1, 3], ...weapon,
      ], 0, f),
      ...(f === 0
        ? [['p', 5, 12, 3, 3], ['p', 8, 12, 3, 3], ['P', 5, 14, 6, 1]]
        : [['p', 6, 12, 2, 3], ['p', 8, 12, 2, 3], ['P', 6, 14, 4, 1]]),
    ],
  };
}

function giant(colours, club) {
  const palette = {
    g: colours.skin, G: darker(colours.skin, 0.25), h: colours.hair, c: colours.cloth, C: darker(colours.cloth, 0.35),
    r: colours.eye, x: colours.extra, ...club.palette,
  };
  return {
    width: 24, height: 28, palette,
    draw: (f) => [
      ...shift([
        ['h', 8, 0, 8, 3], ['g', 8, 2, 8, 7], ['g', 7, 4, 1, 2], ['g', 16, 4, 1, 2], ['G', 9, 4, 6, 1],
        ['r', 10, 5, 1, 1], ['r', 13, 5, 1, 1], ['G', 11, 6, 2, 2], ['G', 10, 8, 4, 1], ['w', 10, 8, 1, 1], ['w', 13, 8, 1, 1],
        ['G', 10, 9, 4, 1], ['g', 6, 10, 12, 9], ['G', 6, 10, 12, 1], ['G', 11, 12, 2, 5], ['G', 9, 16, 6, 2],
        ['g', 3, 10, 3, 9], ['g', 18, 10, 3, 9], ['G', 2, 19, 4, 3], ['G', 18, 19, 4, 3],
        ['c', 6, 18, 12, 5], ['C', 6, 18, 12, 1], ['C', 11, 19, 2, 4],
        ...colours.marks, ...club.ops,
      ], 0, f),
      ...(f === 0
        ? [['g', 7, 22, 4, 4], ['g', 13, 22, 4, 4], ['G', 6, 26, 5, 2], ['G', 13, 26, 5, 2]]
        : [['g', 8, 22, 3, 4], ['g', 13, 22, 3, 4], ['G', 7, 26, 5, 2], ['G', 12, 26, 5, 2]]),
    ],
  };
}

// Frame 0 holds the wing up behind the body. Frame 1 sweeps it down in front of the flank, where it stays visible.
function wing(f) {
  const [tipY, rootY] = f === 0 ? [1, 17] : [37, 20];
  const rows = Math.abs(rootY - tipY);
  const ops = [];
  for (let i = 0; i <= rows; i++) {
    const y = f === 0 ? tipY + i : tipY - i;
    const t = i / rows;
    const left = Math.round(12 + t * 9);
    const right = Math.round(12 + t * 21);
    ops.push(['v', left, y, right - left + 1, 1], ['V', left, y, 1, 1]);
    if (i % 4 === 2) ops.push(['V', Math.round((left + right) / 2), y, 1, 1]);
  }
  return ops;
}

function dragon(colours) {
  const palette = {
    c: colours.body, D: colours.dark, l: colours.belly, v: colours.wing, V: darker(colours.wing, 0.4), y: colours.eye,
  };
  return {
    width: 48, height: 40, palette,
    draw: (f) => [
      ...(f === 0 ? wing(f) : []),
      ...shift([
        ['c', 6, 22, 8, 5], ['c', 2, 23, 6, 3], ['c', 0, 24, 3, 2], ['D', 0, 24, 1, 1],
        ['D', 14, 14, 2, 2], ['D', 19, 14, 2, 2], ['D', 24, 14, 2, 2], ['D', 29, 14, 2, 2],
        ['c', 12, 16, 24, 12], ['l', 13, 25, 22, 3], ['c', 32, 10, 6, 10],
        ['D', 36, 4, 2, 5], ['D', 40, 5, 2, 4], ['c', 36, 8, 9, 8], ['c', 43, 10, 5, 5], ['D', 38, 15, 9, 2],
        ['y', 39, 10, 2, 2], ['D', 46, 11, 1, 1], ['w', 41, 14, 1, 1], ['w', 44, 14, 1, 1],
      ], 0, f),
      ...(f === 0
        ? [['c', 31, 28, 5, 8], ['c', 26, 28, 4, 7], ['c', 14, 28, 5, 8], ['c', 19, 28, 4, 7], ['D', 31, 35, 5, 1], ['D', 14, 35, 5, 1]]
        : [['c', 31, 28, 5, 7], ['c', 26, 28, 4, 8], ['c', 14, 28, 5, 7], ['c', 19, 28, 4, 8], ['D', 26, 35, 4, 1], ['D', 19, 35, 4, 1], ...wing(f)]),
    ],
  };
}

const HILL_CLUB = { palette: { b: '#8a5a2b', B: '#5c3d1e' }, ops: [['b', 20, 7, 2, 14], ['B', 19, 2, 5, 6], ['b', 20, 3, 3, 3]] };
const BOG_CLUB = { palette: { b: '#6b5a3a', B: '#4a3d26' }, ops: [['b', 20, 7, 2, 14], ['B', 19, 2, 5, 6], ['m', 18, 3, 1, 1], ['m', 23, 4, 1, 1], ['m', 20, 1, 1, 1]] };
const FIRE_CLUB = { palette: { b: '#3a2a2a', B: '#e8702a' }, ops: [['b', 20, 7, 2, 14], ['B', 19, 2, 5, 6], ['b', 20, 3, 3, 3], ['B', 21, 8, 1, 3]] };

const ENEMY_ART = {
  chicken: {
    width: 12, height: 10,
    palette: { W: '#cfc9b8', R: '#c0392b', Y: '#e6b030' },
    draw: (f) => [
      ...shift([
        ['W', 0, 3, 2, 3], ['w', 1, 2, 1, 1], ['w', 2, 4, 7, 4], ['w', 3, 3, 5, 1], ['W', 4, 5, 3, 2],
        ['w', 8, 1, 3, 4], ['R', 8, 0, 2, 1], ['Y', 11, 3, 1, 1], ['e', 9, 2, 1, 1], ['R', 10, 5, 1, 1],
      ], 0, f),
      ...(f === 0 ? [['Y', 4, 8, 1, 2], ['Y', 7, 8, 1, 2]] : [['Y', 3, 8, 1, 1], ['Y', 8, 8, 1, 1]]),
    ],
  },
  goblin: {
    width: 16, height: 15,
    palette: { g: '#5a9a3a', G: '#3c6e28', t: '#7a5230', T: '#4f3320' },
    draw: (f) => [
      ...shift([
        ['g', 3, 3, 2, 2], ['g', 2, 3, 1, 1], ['g', 11, 3, 2, 2], ['g', 13, 3, 1, 1], ['g', 5, 2, 6, 5], ['G', 6, 3, 4, 1],
        ['y', 6, 4, 1, 1], ['y', 9, 4, 1, 1], ['G', 7, 6, 2, 1], ['t', 5, 7, 6, 5], ['T', 5, 11, 6, 1],
        ['g', 4, 8, 1, 3], ['g', 11, 8, 1, 3], ['m', 12, 6, 1, 4], ['b', 12, 10, 1, 1],
      ], 0, f),
      ...(f === 0
        ? [['T', 5, 12, 2, 2], ['T', 9, 12, 2, 2], ['G', 5, 14, 2, 1], ['G', 9, 14, 2, 1]]
        : [['T', 6, 12, 2, 2], ['T', 8, 12, 2, 2], ['G', 6, 14, 2, 1], ['G', 8, 14, 2, 1]]),
    ],
  },
  imp: {
    width: 14, height: 14,
    palette: { i: '#d0502a', I: '#8a2a18', v: '#7a4aa0', V: '#4f2a70' },
    draw: (f) => {
      const leftWing = f === 0
        ? [['v', 0, 2, 3, 1], ['v', 0, 3, 4, 2], ['v', 1, 5, 3, 1], ['V', 0, 2, 1, 4]]
        : [['v', 0, 6, 3, 1], ['v', 0, 7, 4, 2], ['v', 1, 9, 3, 1], ['V', 0, 6, 1, 4]];
      return shift([
        ...leftWing, ...mirror(leftWing, 14),
        ['I', 4, 0, 1, 3], ['I', 9, 0, 1, 3], ['i', 5, 2, 4, 4], ['y', 6, 3, 1, 1], ['y', 8, 3, 1, 1], ['w', 6, 5, 2, 1],
        ['i', 5, 6, 4, 4], ['i', 4, 7, 1, 2], ['i', 9, 7, 1, 2], ['I', 10, 9, 2, 1], ['I', 12, 8, 1, 2],
        ['I', 5, 10, 1, 2], ['I', 8, 10, 1, 2],
      ], 0, f);
    },
  },
  cow: {
    width: 20, height: 15,
    palette: { k: '#2a2a2e', p: '#e8a0a0', b: '#d8d0a8', d: '#3a3a3e' },
    draw: (f) => [
      ...shift([
        ['w', 2, 4, 14, 7], ['w', 3, 3, 12, 1], ['k', 5, 4, 3, 3], ['k', 11, 7, 3, 3], ['k', 13, 4, 2, 2],
        ['w', 0, 4, 2, 1], ['k', 1, 5, 1, 4], ['w', 15, 3, 5, 5], ['k', 15, 3, 2, 2], ['p', 17, 6, 3, 2], ['k', 18, 7, 1, 1],
        ['e', 17, 4, 1, 1], ['b', 15, 1, 1, 2], ['b', 19, 1, 1, 2], ['p', 8, 11, 3, 1],
      ], 0, f),
      ...(f === 0
        ? [['w', 3, 11, 2, 3], ['w', 6, 11, 2, 3], ['w', 12, 11, 2, 3], ['w', 15, 11, 2, 3],
          ['d', 3, 14, 2, 1], ['d', 6, 14, 2, 1], ['d', 12, 14, 2, 1], ['d', 15, 14, 2, 1]]
        : [['w', 4, 11, 2, 2], ['w', 7, 11, 2, 3], ['w', 11, 11, 2, 3], ['w', 14, 11, 2, 2],
          ['d', 7, 14, 2, 1], ['d', 11, 14, 2, 1], ['d', 4, 13, 2, 1], ['d', 14, 13, 2, 1]]),
    ],
  },
  guard: knight(
    { plate: '#9aa0a6', tabard: '#3b5f8a', plume: '#c0392b', eye: INK },
    [['b', 13, 1, 1, 13], ['m', 13, 0, 1, 2]],
  ),
  blackKnight: knight(
    { plate: '#2b2b32', tabard: '#1a1a20', plume: '#c0392b', eye: '#e04030' },
    [['m', 13, 5, 1, 7], ['P', 12, 11, 3, 1], ['P', 1, 8, 3, 5], ['a', 2, 9, 1, 3]],
  ),
  hillGiant: giant({ skin: '#c8935a', hair: '#5a3a1a', cloth: '#6b4a2b', eye: INK, marks: [] }, HILL_CLUB),
  bogGiant: giant(
    { skin: '#6a8a5a', hair: '#3a4a2a', cloth: '#4a5a3a', eye: '#f0e050', marks: [['x', 7, 12, 2, 2], ['x', 15, 14, 3, 2], ['x', 9, 3, 3, 1]], extra: '#4f7a3a' },
    BOG_CLUB,
  ),
  fireGiant: giant(
    { skin: '#d0542a', hair: '#f0a030', cloth: '#3a1a14', eye: '#f4f0a0', marks: [['x', 8, -1, 2, 2], ['x', 12, -2, 2, 3], ['x', 15, -1, 1, 2]], extra: '#f0a030' },
    FIRE_CLUB,
  ),
  dragonGreen: dragon({ body: '#3e8a3a', dark: '#27582a', belly: '#c9d98a', wing: '#5aa84f', eye: '#f0e050' }),
  dragonBlue: dragon({ body: '#2f6fb0', dark: '#1d3f6b', belly: '#9cc7e8', wing: '#4a86c8', eye: '#f0e050' }),
  dragonRed: dragon({ body: '#b8312a', dark: '#6e1a16', belly: '#e8a070', wing: '#d4503a', eye: '#f0e050' }),
  dragonBlack: dragon({ body: '#2a2a30', dark: '#121216', belly: '#5a5a64', wing: '#46465a', eye: '#e04030' }),
};

// Riveted grey plates over the middle of the body. The pattern is laid on the sprite's own pixels,
// so it fits every enemy shape without a separate drawing for each.
function addPlates(grid, art) {
  const top = ENEMY_MARGIN + art.height * 0.35;
  const bottom = ENEMY_MARGIN + art.height * 0.8;
  for (let y = Math.ceil(top); y < bottom; y++) {
    for (let x = 0; x < grid.width; x++) {
      const index = y * grid.width + x;
      if (grid.cells[index] === null) continue;
      if (x % 4 === 0 && y % 4 === 0) grid.cells[index] = '#e8ecee';
      else if (x % 4 === 3 || y % 4 === 3) grid.cells[index] = '#6a7076';
      else grid.cells[index] = '#a9afb5';
    }
  }
}

const ICE = '#bfe8ff';

function buildEnemy(type, frame, { armoured, frozen }) {
  const art = ENEMY_ART[type];
  const grid = makeGrid(art.width + ENEMY_MARGIN * 2, art.height + ENEMY_MARGIN * 2);
  paint(grid, art.draw(frame), { ...ENEMY_BASE_PALETTE, ...art.palette }, ENEMY_MARGIN, ENEMY_MARGIN);
  if (armoured) addPlates(grid, art);
  if (frozen) grid.cells = grid.cells.map((colour) => (colour ? mix(colour, ICE, 0.55) : null));
  ring(grid, frozen ? '#4a7a9a' : INK, isInk);
  return toCanvas(grid);
}

function buildWardRing(type) {
  const art = ENEMY_ART[type];
  const grid = makeGrid(art.width + ENEMY_MARGIN * 2, art.height + ENEMY_MARGIN * 2);
  paint(grid, art.draw(0), { ...ENEMY_BASE_PALETTE, ...art.palette }, ENEMY_MARGIN, ENEMY_MARGIN);
  ring(grid, INK, isInk);
  ring(grid, '#b07fe0', isInk);
  ring(grid, '#8a55c8', isInk);
  grid.cells = grid.cells.map((colour) => (colour === '#b07fe0' || colour === '#8a55c8' ? colour : null));
  return toCanvas(grid);
}

const enemyCache = new Map();

function cached(key, build) {
  if (!enemyCache.has(key)) enemyCache.set(key, build());
  return enemyCache.get(key);
}

/** Sprite height in screen pixels above and below an enemy's position, for health bars and hit tests. */
export function enemyExtent(type) {
  const { height } = ENEMY_ART[type];
  return { above: Math.round(height * (1 - FEET_BELOW_CENTRE) * SCALE), below: Math.round(height * FEET_BELOW_CENTRE * SCALE) };
}

export function enemyWidth(type) {
  return ENEMY_ART[type].width * SCALE;
}

/**
 * Draws one enemy with its modifiers and status on top. `time` is real seconds, used for the pulse and glint.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{id: number, type: string, mods: {armoured: boolean, warded: boolean}, progress: number, slow: number, frozenFor: number, dir: number}} enemy
 */
export function drawEnemy(ctx, enemy, x, y, time) {
  const frozen = enemy.frozenFor > 0;
  const walkPhase = ENEMIES[enemy.type].boss ? Math.floor(time * 3 + enemy.id) : Math.floor(enemy.progress / 14);
  const frame = frozen ? 0 : walkPhase & 1;
  const sprite = cached(`${enemy.type}|${frame}|${enemy.mods.armoured}|${frozen}`, () =>
    buildEnemy(enemy.type, frame, { armoured: enemy.mods.armoured, frozen }));
  const { above, below } = enemyExtent(enemy.type);
  const art = ENEMY_ART[enemy.type];
  const margin = ENEMY_MARGIN * SCALE;
  const left = -sprite.width / 2;
  const top = -above - margin;

  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (enemy.dir < 0) ctx.scale(-1, 1);
  if (enemy.mods.warded) {
    ctx.globalAlpha = 0.45 + 0.4 * Math.sin(time * 5);
    ctx.drawImage(cached(`${enemy.type}|ward`, () => buildWardRing(enemy.type)), left, top);
    ctx.globalAlpha = 1;
  }
  ctx.drawImage(sprite, left, top);
  ctx.restore();

  if (frozen && Math.floor(time * 4) % 2 === 0) {
    const gx = Math.round(x - art.width * 0.5);
    const gy = Math.round(y - above * 0.75);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(gx - 2, gy, 6, 2);
    ctx.fillRect(gx, gy - 2, 2, 6);
  }
  if (enemy.slow > 0) {
    ctx.fillStyle = '#7bd36b';
    for (let k = 0; k < 4; k++) {
      const angle = time * 6 + (k * Math.PI) / 2;
      ctx.fillRect(Math.round(x + Math.cos(angle) * 10) - 1, Math.round(y + below - 2 + Math.sin(angle) * 3.5), 3, 2);
    }
  }
}
