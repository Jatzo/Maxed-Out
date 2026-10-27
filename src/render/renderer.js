// Draws a game state onto the 960 x 640 canvas. It reads state and never changes it.
// The terrain is painted once to an offscreen canvas; only the water shimmer is redrawn each frame.
import { MAP, TILE, TOWERS, ENEMIES, RULES } from '../core/data.js';
import { drawText } from './font.js';
import { drawTower, drawEnemy, enemyExtent, enemyWidth } from './sprites.js';

export const WIDTH = 960;
export const HEIGHT = 640;

// With reduced motion asked for, the water holds still instead of shimmering.
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const GRASS = ['#5f9a3c', '#689f42', '#559034'];
const SPELL_COLOURS = { 'spell-air': '#d8dce0', 'spell-water': '#4aa0e0', 'spell-earth': '#9a9a38', 'spell-fire': '#f08030' };

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A disc made of 2 pixel rows, so round shapes keep the chunky look of the sprites.
function disc(ctx, cx, cy, radius, colour) {
  ctx.fillStyle = colour;
  for (let dy = -radius; dy < radius; dy += 2) {
    const half = Math.floor(Math.sqrt(Math.max(0, radius * radius - (dy + 1) * (dy + 1))) / 2) * 2;
    ctx.fillRect(Math.round(cx - half), Math.round(cy + dy), half * 2, 2);
  }
}

const isRoad = (ch) => ch === '#' || ch === '=';

function paintGrass(ctx, x, y, random) {
  ctx.fillStyle = GRASS[Math.floor(random() * GRASS.length)];
  ctx.fillRect(x, y, TILE, TILE);
  ctx.fillStyle = '#76ad4e';
  for (let k = 0; k < 7; k++) ctx.fillRect(x + Math.floor(random() * 15) * 2, y + Math.floor(random() * 15) * 2, 2, 2);
  ctx.fillStyle = '#477a2c';
  for (let k = 0; k < 3; k++) {
    const tx = x + 2 + Math.floor(random() * 12) * 2;
    const ty = y + 6 + Math.floor(random() * 11) * 2;
    ctx.fillRect(tx, ty, 2, 2);
    ctx.fillRect(tx + 4, ty, 2, 2);
    ctx.fillRect(tx + 2, ty - 2, 2, 2);
  }
}

function paintPath(ctx, x, y, col, row, terrain, random) {
  ctx.fillStyle = '#b08a58';
  ctx.fillRect(x, y, TILE, TILE);
  ctx.fillStyle = '#9a7548';
  for (let k = 0; k < 9; k++) ctx.fillRect(x + Math.floor(random() * 15) * 2, y + Math.floor(random() * 15) * 2, 2, 2);
  ctx.fillStyle = '#c9b48a';
  for (let k = 0; k < 2; k++) ctx.fillRect(x + 2 + Math.floor(random() * 12) * 2, y + 2 + Math.floor(random() * 12) * 2, 4, 2);
  ctx.fillStyle = '#7a5c36';
  ctx.fillRect(x + 4 + Math.floor(random() * 11) * 2, y + 4 + Math.floor(random() * 11) * 2, 2, 2);
  const open = (c, r) => c < 0 || c >= terrain[0].length || r < 0 || r >= terrain.length || isRoad(terrain[r][c]);
  ctx.fillStyle = '#6e5230';
  if (!open(col, row - 1)) ctx.fillRect(x, y, TILE, 4);
  if (!open(col, row + 1)) ctx.fillRect(x, y + TILE - 4, TILE, 4);
  if (!open(col - 1, row)) ctx.fillRect(x, y, 4, TILE);
  if (!open(col + 1, row)) ctx.fillRect(x + TILE - 4, y, 4, TILE);
}

function paintWater(ctx, x, y, col, row, terrain, random) {
  ctx.fillStyle = '#2f6fb0';
  ctx.fillRect(x, y, TILE, TILE);
  ctx.fillStyle = '#285f9a';
  for (let k = 0; k < 4; k++) ctx.fillRect(x + Math.floor(random() * 12) * 2, y + Math.floor(random() * 15) * 2, 8, 2);
  const dry = (c, r) => r >= 0 && r < terrain.length && c >= 0 && c < terrain[0].length && terrain[r][c] !== '~' && terrain[r][c] !== '=';
  ctx.fillStyle = '#8fc0e8';
  if (dry(col - 1, row)) ctx.fillRect(x, y, 3, TILE);
  if (dry(col + 1, row)) ctx.fillRect(x + TILE - 3, y, 3, TILE);
}

function paintBridge(ctx, x, y) {
  ctx.fillStyle = '#2f6fb0';
  ctx.fillRect(x, y, TILE, TILE);
  ctx.fillStyle = '#9a6a35';
  ctx.fillRect(x, y + 4, TILE, TILE - 8);
  ctx.fillStyle = '#6b4a22';
  for (let k = 0; k < TILE; k += 8) ctx.fillRect(x + k, y + 4, 2, TILE - 8);
  ctx.fillStyle = '#b4854a';
  for (let k = 0; k < TILE; k += 8) ctx.fillRect(x + k + 2, y + 6, 2, 2);
  ctx.fillStyle = '#5c3d1e';
  ctx.fillRect(x, y, TILE, 4);
  ctx.fillRect(x, y + TILE - 4, TILE, 4);
  ctx.fillStyle = '#3b2814';
  ctx.fillRect(x + 12, y, 6, 6);
  ctx.fillRect(x + 12, y + TILE - 6, 6, 6);
}

function paintTree(ctx, cx, cy, random) {
  const greens = [['#1f4a24', '#2f7a34', '#3f9a44'], ['#1d4a2e', '#2a7a40', '#3a9a52'], ['#27501f', '#3a7f2a', '#4f9f38']];
  const [edge, body, light] = greens[Math.floor(random() * greens.length)];
  ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
  ctx.fillRect(cx - 12, cy + 12, 24, 6);
  ctx.fillStyle = '#6b4a2b';
  ctx.fillRect(cx - 3, cy + 4, 6, 12);
  ctx.fillStyle = '#4a3320';
  ctx.fillRect(cx + 1, cy + 4, 2, 12);
  disc(ctx, cx, cy - 6, 18, edge);
  disc(ctx, cx, cy - 6, 16, body);
  disc(ctx, cx + 4, cy, 10, edge);
  disc(ctx, cx + 4, cy - 1, 8, '#26632a');
  disc(ctx, cx - 4, cy - 12, 8, light);
}

function paintRock(ctx, cx, cy) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
  ctx.fillRect(cx - 12, cy + 8, 24, 5);
  disc(ctx, cx, cy + 2, 12, '#5c5f62');
  disc(ctx, cx, cy + 1, 10, '#8a8d90');
  disc(ctx, cx - 3, cy - 3, 5, '#b5b8bb');
  disc(ctx, cx + 9, cy + 7, 6, '#7c7f82');
}

function paintCastle(ctx, terrain) {
  const isCastle = (c, r) => r >= 0 && r < terrain.length && terrain[r][c] === 'C';
  for (let row = 0; row < terrain.length; row++) {
    for (let col = 0; col < terrain[row].length; col++) {
      if (terrain[row][col] !== 'C') continue;
      const x = col * TILE;
      const y = row * TILE;
      ctx.fillStyle = '#9a9a96';
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = '#6f6f6b';
      for (let k = 0; k < TILE; k += 8) {
        ctx.fillRect(x, y + k, TILE, 2);
        const stagger = (k / 8) % 2 === 0 ? 0 : 8;
        for (let j = stagger; j < TILE; j += 16) ctx.fillRect(x + j, y + k, 2, 8);
      }
      ctx.fillStyle = '#b8b8b2';
      ctx.fillRect(x, y, TILE, 2);
      if (!isCastle(col, row - 1)) {
        ctx.fillStyle = '#6f6f6b';
        ctx.fillRect(x, y - 2, TILE, 4);
        ctx.fillStyle = '#9a9a96';
        for (let k = 0; k < TILE; k += 16) ctx.fillRect(x + k, y - 8, 8, 8);
        ctx.fillStyle = '#b8b8b2';
        for (let k = 0; k < TILE; k += 16) ctx.fillRect(x + k, y - 8, 8, 2);
      }
      if (!isCastle(col + 1, row)) {
        ctx.fillStyle = '#5a5a56';
        ctx.fillRect(x + TILE - 4, y, 4, TILE);
      }
    }
  }
}

// Every tile of one character, as a bounding box, so a building drawn over several tiles is painted once.
function boxOf(terrain, ch) {
  let left = Infinity, top = Infinity, right = -1, bottom = -1;
  terrain.forEach((line, row) => [...line].forEach((cell, col) => {
    if (cell !== ch) return;
    left = Math.min(left, col); right = Math.max(right, col); top = Math.min(top, row); bottom = Math.max(bottom, row);
  }));
  return right < 0 ? null : { x: left * TILE, y: top * TILE, width: (right - left + 1) * TILE, height: (bottom - top + 1) * TILE };
}

function paintCourtyard(ctx, x, y, random) {
  ctx.fillStyle = '#8f8b80';
  ctx.fillRect(x, y, TILE, TILE);
  ctx.fillStyle = '#7a766c';
  ctx.fillRect(x, y + 15, TILE, 2);
  ctx.fillRect(x + 15, y, 2, 15);
  ctx.fillRect(x + 7, y + 17, 2, 15);
  if (random() < 0.3) {
    ctx.fillStyle = '#a19c90';
    ctx.fillRect(x + 2, y + 2, 12, 12);
  }
}

// A round tower with a crenellated rim and a dark hatch, standing over the corner of the walls.
function paintTower(ctx, col, row) {
  const cx = col * TILE + 16;
  const cy = row * TILE + 14;
  disc(ctx, cx + 2, cy + 4, 20, 'rgba(0, 0, 0, 0.25)');
  disc(ctx, cx, cy, 20, '#6f6f6b');
  disc(ctx, cx, cy, 16, '#a2a29c');
  disc(ctx, cx, cy, 6, '#4a4a46');
  ctx.fillStyle = '#6f6f6b';
  for (let k = 0; k < 8; k++) {
    const angle = (k / 8) * Math.PI * 2;
    ctx.fillRect(Math.round(cx + Math.cos(angle) * 16) - 3, Math.round(cy + Math.sin(angle) * 16) - 3, 6, 6);
  }
}

// An arched opening with a raised portcullis, drawn on the path tile where enemies reach the castle.
function paintGate(ctx, col, row) {
  const x = col * TILE;
  const y = row * TILE;
  ctx.fillStyle = '#6f6f6b';
  ctx.fillRect(x - 4, y - 6, TILE + 8, 10);
  ctx.fillStyle = '#9a9a96';
  ctx.fillRect(x - 4, y - 6, TILE + 8, 4);
  ctx.fillStyle = '#2a2622';
  ctx.fillRect(x + 4, y + 4, TILE - 8, TILE - 4);
  ctx.fillStyle = '#5a5a56';
  for (let bar = x + 6; bar < x + TILE - 4; bar += 6) ctx.fillRect(bar, y + 4, 2, 10);
  ctx.fillRect(x + 4, y + 12, TILE - 8, 2);
}

function paintPennant(ctx, x, y, colour) {
  ctx.fillStyle = '#4a3b2a';
  ctx.fillRect(x, y - 30, 2, 30);
  ctx.fillStyle = colour;
  for (let k = 0; k < 6; k++) ctx.fillRect(x + 2, y - 30 + k * 2, 14 - k * 2, 2);
}

// A stone church with a slate roof, arched windows and a steeple with a spire at its west end.
function paintChurch(ctx, box) {
  const { x, y, width, height } = box;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.fillRect(x + 6, y + 10, width, height - 4);
  ctx.fillStyle = '#c8c2b0';
  ctx.fillRect(x + 4, y + 22, width - 8, height - 24);
  ctx.fillStyle = '#5a5a66';
  ctx.fillRect(x, y + 10, width, 14);
  ctx.fillStyle = '#6c6c7a';
  ctx.fillRect(x, y + 10, width, 4);
  ctx.fillStyle = '#2f4a6a';
  for (let wx = x + 30; wx < x + width - 12; wx += 18) {
    ctx.fillRect(wx, y + 34, 8, 14);
    ctx.fillRect(wx + 2, y + 32, 4, 2);
  }
  ctx.fillStyle = '#4a3b2a';
  ctx.fillRect(x + width / 2 + 6, y + height - 18, 12, 16);
  ctx.fillStyle = '#b8b2a0';
  ctx.fillRect(x + 4, y - 2, 22, height - 2);
  ctx.fillStyle = '#9a9488';
  ctx.fillRect(x + 22, y - 2, 4, height - 2);
  ctx.fillStyle = '#5a5a66';
  for (let k = 0; k < 6; k++) ctx.fillRect(x + 5 + k * 2, y - 2 - k * 4, 20 - k * 4, 4);
  ctx.fillStyle = '#e6c84f';
  ctx.fillRect(x + 14, y - 34, 2, 10);
  ctx.fillRect(x + 11, y - 30, 8, 2);
  ctx.fillStyle = '#2a2622';
  ctx.fillRect(x + 11, y + 14, 8, 10);
}

// A timber-framed shop with a striped awning over the door and a coin on its sign.
function paintShop(ctx, box) {
  const { x, y, width, height } = box;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.fillRect(x + 6, y + 6, width, height - 2);
  ctx.fillStyle = '#d8cfae';
  ctx.fillRect(x + 2, y + 8, width - 4, height - 10);
  ctx.fillStyle = '#6b4a2b';
  ctx.fillRect(x, y, width, 10);
  for (let bx = x + 2; bx < x + width; bx += 30) ctx.fillRect(bx, y + 8, 4, height - 10);
  ctx.fillRect(x + 2, y + height - 6, width - 4, 4);
  for (let k = 0; k < width; k += 12) {
    ctx.fillStyle = k % 24 === 0 ? '#c0392b' : '#f4efe0';
    ctx.fillRect(x + k, y + 18, 12, 10);
  }
  ctx.fillStyle = '#4a3b2a';
  ctx.fillRect(x + width / 2 - 8, y + 34, 16, height - 40);
  disc(ctx, x + 20, y + 42, 6, '#e6c84f');
  ctx.fillStyle = '#b8901f';
  ctx.fillRect(x + 18, y + 40, 4, 4);
}

// Posts with rails running towards whichever neighbours are also fence.
function paintFence(ctx, col, row, terrain) {
  const isFence = (c, r) => terrain[r]?.[c] === 'F';
  const x = col * TILE;
  const y = row * TILE;
  ctx.fillStyle = '#8a5a2b';
  if (isFence(col - 1, row) || isFence(col + 1, row)) {
    ctx.fillRect(isFence(col - 1, row) ? x : x + 14, y + 12, isFence(col + 1, row) ? TILE - (isFence(col - 1, row) ? 0 : 14) : 18, 3);
    ctx.fillRect(isFence(col - 1, row) ? x : x + 14, y + 20, isFence(col + 1, row) ? TILE - (isFence(col - 1, row) ? 0 : 14) : 18, 3);
  }
  if (isFence(col, row - 1) || isFence(col, row + 1)) {
    ctx.fillRect(x + 12, isFence(col, row - 1) ? y : y + 14, 3, isFence(col, row + 1) ? TILE : 18);
    ctx.fillRect(x + 19, isFence(col, row - 1) ? y : y + 14, 3, isFence(col, row + 1) ? TILE : 18);
  }
  ctx.fillStyle = '#5c3d1e';
  ctx.fillRect(x + 13, y + 8, 6, 18);
  ctx.fillStyle = '#a0703c';
  ctx.fillRect(x + 13, y + 8, 6, 2);
}

function paintMarsh(ctx, x, y, random) {
  ctx.fillStyle = '#4a5a32';
  ctx.fillRect(x, y, TILE, TILE);
  ctx.fillStyle = '#3a6a6a';
  ctx.fillRect(x + 4 + Math.floor(random() * 6) * 2, y + 6 + Math.floor(random() * 4) * 2, 12, 6);
  ctx.fillStyle = '#5a8a8a';
  ctx.fillRect(x + 6, y + 8, 4, 2);
  ctx.fillStyle = '#2f4a22';
  for (let k = 0; k < 3; k++) {
    const rx = x + 2 + Math.floor(random() * 14) * 2;
    ctx.fillRect(rx, y + 16, 2, 12);
    ctx.fillStyle = '#6b4a2b';
    ctx.fillRect(rx, y + 14, 2, 4);
    ctx.fillStyle = '#2f4a22';
  }
}

// The forest leaves a gap where the path enters, so the gap follows the first waypoint.
function paintForestEdge(ctx, random) {
  const entryRow = MAP.waypoints[0][1];
  const gapTop = entryRow * TILE - 16;
  const gapBottom = (entryRow + 1) * TILE + 16;
  for (let y = 10; y < HEIGHT + 20; y += 30) {
    if (y > gapTop && y < gapBottom) continue;
    disc(ctx, -2 + Math.floor(random() * 8), y, 20, '#173d1d');
    disc(ctx, 0 + Math.floor(random() * 8), y - 2, 16, '#22552a');
  }
}

function buildTerrain(terrain) {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  const random = seededRandom(7);
  const water = [];
  const towers = [];
  terrain.forEach((line, row) => {
    [...line].forEach((ch, col) => {
      const x = col * TILE;
      const y = row * TILE;
      if (ch === '#') paintPath(ctx, x, y, col, row, terrain, random);
      else if (ch === '~') {
        paintWater(ctx, x, y, col, row, terrain, random);
        water.push({ x, y, phase: random() * 6 });
      } else if (ch === '=') {
        paintBridge(ctx, x, y);
        water.push({ x, y, phase: random() * 6, bridge: true });
      } else if (ch === 'Y') paintCourtyard(ctx, x, y, random);
      else if (ch === 'm') paintMarsh(ctx, x, y, random);
      else {
        paintGrass(ctx, x, y, random);
        if (ch === 'F') paintFence(ctx, col, row, terrain);
        if (ch === 'K') towers.push([col, row]);
      }
    });
  });
  paintCastle(ctx, terrain);
  const [gateCol, gateRow] = MAP.waypoints[MAP.waypoints.length - 1];
  paintGate(ctx, gateCol, gateRow);
  for (const [col, row] of towers) paintTower(ctx, col, row);
  terrain.forEach((line, row) => {
    [...line].forEach((ch, col) => {
      if (ch === 'T') paintTree(ctx, col * TILE + 16 + Math.floor(random() * 5) - 2, row * TILE + 14, random);
      else if (ch === 'R') paintRock(ctx, col * TILE + 16, row * TILE + 16);
    });
  });
  // Buildings go over the trees so the church's steeple is not hidden by the tree line behind it.
  const church = boxOf(terrain, 'H');
  if (church) paintChurch(ctx, church);
  const shop = boxOf(terrain, 'S');
  if (shop) paintShop(ctx, shop);
  // Pennants fly from the two towers on the gate's wall.
  towers.filter(([, row]) => row === gateRow).forEach(([col], index) => {
    paintPennant(ctx, col * TILE + 15, gateRow * TILE - 6, index === 0 ? '#c0392b' : '#3b5f8a');
  });
  paintForestEdge(ctx, random);
  return { canvas, water: water.filter((tile) => !tile.bridge) };
}

function drawShimmer(ctx, water, time) {
  ctx.fillStyle = '#d4eaff';
  for (const tile of water) {
    for (let k = 0; k < 2; k++) {
      const wave = Math.sin(time * 1.4 + tile.phase + k * 2.1);
      ctx.globalAlpha = 0.14 + 0.2 * Math.max(0, wave);
      ctx.fillRect(tile.x + 4 + Math.round((0.5 + 0.5 * Math.sin(time * 0.8 + tile.phase * 2 + k)) * 12), tile.y + 6 + k * 14, 10, 2);
    }
  }
  ctx.globalAlpha = 1;
}

function drawRange(ctx, x, y, tiles, colour) {
  ctx.beginPath();
  ctx.arc(x, y, tiles * TILE, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = colour;
  ctx.stroke();
}

function drawProjectile(ctx, projectile, alpha, time) {
  const x = projectile.prevX + (projectile.x - projectile.prevX) * alpha;
  const y = projectile.prevY + (projectile.y - projectile.prevY) * alpha;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.rotate(projectile.angle);
  switch (projectile.kind) {
    case 'arrow':
      ctx.fillStyle = '#e8e0cc';
      ctx.fillRect(-8, -2, 3, 4);
      ctx.fillStyle = '#8a5a2b';
      ctx.fillRect(-6, -1, 12, 2);
      ctx.fillStyle = '#d8dcdf';
      ctx.fillRect(6, -2, 4, 4);
      break;
    case 'bolt':
      ctx.fillStyle = '#3a3a3e';
      ctx.fillRect(-5, -2, 9, 4);
      ctx.fillStyle = '#d8dcdf';
      ctx.fillRect(4, -3, 5, 6);
      break;
    case 'frost':
      ctx.fillStyle = 'rgba(191, 244, 255, 0.4)';
      ctx.fillRect(-14, -1, 8, 2);
      ctx.fillStyle = '#9ce8ff';
      ctx.beginPath();
      ctx.moveTo(-8, 0);
      ctx.lineTo(0, -4);
      ctx.lineTo(10, 0);
      ctx.lineTo(0, 4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-2, -1, 8, 2);
      break;
    // A small round critter, tumbling as it flies, with a lit fuse on its back.
    case 'bomb': {
      ctx.rotate(time * 12);
      ctx.fillStyle = '#6f6a62';
      ctx.fillRect(-5, -4, 10, 8);
      ctx.fillRect(-4, -5, 8, 10);
      ctx.fillStyle = '#9a948a';
      ctx.fillRect(-3, -4, 4, 3);
      ctx.fillStyle = '#4a4640';
      ctx.fillRect(-5, -7, 3, 3);
      ctx.fillRect(2, -7, 3, 3);
      ctx.fillStyle = '#1a1410';
      ctx.fillRect(-3, -1, 2, 2);
      ctx.fillRect(1, -1, 2, 2);
      ctx.fillStyle = Math.floor(time * 20) % 2 ? '#f0b030' : '#ff6a20';
      ctx.fillRect(4, 3, 3, 3);
      break;
    }
    case 'storm': {
      const jitter = seededRandom(projectile.id * 31 + Math.floor(time * 18));
      const points = Array.from({ length: 6 }, (_, k) => [-10 + k * 4, (jitter() - 0.5) * 10]);
      for (const [width, colour] of [[5, 'rgba(160, 96, 224, 0.7)'], [2, '#f4e050']]) {
        ctx.lineWidth = width;
        ctx.strokeStyle = colour;
        ctx.beginPath();
        points.forEach(([px, py], k) => (k ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
        ctx.stroke();
      }
      break;
    }
    default: {
      const colour = SPELL_COLOURS[projectile.kind];
      ctx.rotate(-projectile.angle);
      disc(ctx, 0, 0, 8, `${colour}55`);
      disc(ctx, 0, 0, 6, `${colour}bb`);
      disc(ctx, 0, 0, 4, colour);
      disc(ctx, -1, -1, 2, '#ffffff');
    }
  }
  ctx.restore();
}

function drawBar(ctx, x, y, width, fraction, fill) {
  ctx.fillStyle = '#1b1712';
  ctx.fillRect(Math.round(x - 1), Math.round(y - 1), width + 2, 6);
  ctx.fillStyle = '#a02a20';
  ctx.fillRect(Math.round(x), Math.round(y), width, 4);
  ctx.fillStyle = fill;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(width * fraction), 4);
}

function drawHud(ctx, state, effects, zoom) {
  const width = WIDTH / zoom;
  ctx.save();
  ctx.scale(zoom, zoom);
  ctx.fillStyle = 'rgba(42, 33, 24, 0.88)';
  ctx.fillRect(0, 0, width, 38);
  ctx.fillStyle = '#1b1712';
  ctx.fillRect(0, 38, width, 2);

  const flash = effects.leakStrength();
  const orbRadius = 16 + Math.round(flash * 2);
  disc(ctx, 26, 20, orbRadius + 2, '#1b1712');
  disc(ctx, 26, 20, orbRadius, flash > 0 ? '#ff7a66' : '#c0392b');
  disc(ctx, 26, 20, orbRadius - 4, flash > 0 ? '#ff9a88' : '#d9503f');
  disc(ctx, 20, 13, 4, 'rgba(255, 255, 255, 0.5)');
  drawText(ctx, String(Math.max(0, Math.ceil(state.lives))), 26, 13, { align: 'center', colour: '#ffffff', shadow: '#5a1710' });

  disc(ctx, 96, 20, 12, '#7a5a10');
  disc(ctx, 96, 20, 10, '#e6c84f');
  disc(ctx, 96, 20, 6, '#c9a22a');
  ctx.fillStyle = '#fff3b0';
  ctx.fillRect(92, 14, 2, 4);
  drawText(ctx, String(Math.floor(state.gold)), 114, 13, { colour: '#e6c84f' });

  const waveLabel = state.wave > RULES.winWave ? `Wave ${state.wave}` : `Wave ${state.wave} / ${RULES.winWave}`;
  drawText(ctx, waveLabel, width - 12, 13, { align: 'right' });

  const boss = state.enemies.find((enemy) => ENEMIES[enemy.type].boss);
  if (boss) {
    const barWidth = 320;
    const left = (width - barWidth) / 2;
    const fraction = Math.max(0, boss.hp / boss.maxHp);
    drawText(ctx, ENEMIES[boss.type].name, width / 2, 46, { align: 'center', colour: '#f1e6c8' });
    ctx.fillStyle = '#1b1712';
    ctx.fillRect(left - 2, 62, barWidth + 4, 14);
    ctx.fillStyle = '#5a1710';
    ctx.fillRect(left, 64, barWidth, 10);
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(left, 64, Math.round(barWidth * fraction), 10);
    ctx.fillStyle = '#e6c84f';
    ctx.fillRect(left, 64, Math.round(barWidth * fraction), 2);
  }
  ctx.restore();
}

// How much to enlarge the on-canvas text. The board scales down to fit a phone, which would shrink
// numbers past reading, so the zoom keeps a character about 9 screen pixels tall at the least.
function textZoom(canvas) {
  const shownWidth = canvas.getBoundingClientRect().width || WIDTH;
  return Math.max(1, Math.ceil(9 / (14 * (shownWidth / WIDTH))));
}

/**
 * @param {HTMLCanvasElement} canvas
 */
export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  let terrainKey = '';
  let terrain = null;

  /**
   * @param {object} view
   * @param {import('../core/contract.js').Game} view.state
   * @param {number} view.alpha How far between the last two steps the frame falls, 0 to 1.
   * @param {number} view.time Real seconds, for animation that does not depend on the simulation.
   * @param {{type: string, col: number, row: number, valid: boolean} | null} view.hover
   * @param {number | null} view.selectedId
   * @param {{type: string, col: number, row: number}[]} view.ghosts
   * @param {ReturnType<import('../ui/effects.js').createEffects>} view.effects
   */
  function draw({ state, alpha, time, hover, selectedId, ghosts, effects }) {
    const key = state.map.terrain.join('');
    if (key !== terrainKey) {
      terrain = buildTerrain(state.map.terrain);
      terrainKey = key;
    }
    ctx.drawImage(terrain.canvas, 0, 0);
    drawShimmer(ctx, terrain.water, reducedMotion.matches ? 0 : time);

    const taken = new Set(state.towers.map((tower) => `${tower.col},${tower.row}`));
    for (const ghost of ghosts) {
      if (taken.has(`${ghost.col},${ghost.row}`)) continue;
      ctx.fillStyle = 'rgba(230, 200, 79, 0.16)';
      ctx.fillRect(ghost.col * TILE, ghost.row * TILE, TILE, TILE);
      ctx.globalAlpha = 0.32 + 0.1 * Math.sin(time * 3);
      drawTower(ctx, ghost.type, 0, ghost.col * TILE + TILE / 2, ghost.row * TILE + TILE / 2);
      ctx.globalAlpha = 1;
    }

    const selected = state.towers.find((tower) => tower.id === selectedId);
    if (selected) {
      drawRange(ctx, selected.x, selected.y, TOWERS[selected.type].tiers[selected.tier].stats.range || 0, 'rgba(255, 255, 255, 0.6)');
      ctx.strokeStyle = '#e6c84f';
      ctx.lineWidth = 2;
      ctx.strokeRect(selected.col * TILE + 1, selected.row * TILE + 1, TILE - 2, TILE - 2);
    }

    for (const tower of [...state.towers].sort((a, b) => a.y - b.y || a.x - b.x)) {
      drawTower(ctx, tower.type, tower.tier, tower.x, tower.y, {
        attacking: tower.attackAnim < 0.15,
        flip: Math.cos(tower.angle) < 0,
      });
      for (let k = 0; k < tower.tier; k++) {
        const pipX = Math.round(tower.x - tower.tier * 3 + k * 6);
        ctx.fillStyle = '#1b1712';
        ctx.fillRect(pipX - 1, tower.y + 14, 6, 5);
        ctx.fillStyle = '#e6c84f';
        ctx.fillRect(pipX, tower.y + 15, 4, 3);
      }
    }

    if (hover) {
      const x = hover.col * TILE;
      const y = hover.row * TILE;
      const centreX = x + TILE / 2;
      const centreY = y + TILE / 2;
      drawRange(ctx, centreX, centreY, TOWERS[hover.type].tiers[0].stats.range || 0, hover.valid ? 'rgba(120, 220, 120, 0.8)' : 'rgba(230, 90, 80, 0.8)');
      ctx.fillStyle = hover.valid ? 'rgba(76, 175, 80, 0.4)' : 'rgba(192, 57, 43, 0.5)';
      ctx.fillRect(x, y, TILE, TILE);
      ctx.globalAlpha = 0.7;
      drawTower(ctx, hover.type, 0, centreX, centreY);
      ctx.globalAlpha = 1;
    }

    // Enemies of one type walk the same line at the same speed, so a tight group draws as a single blob. A small
    // fixed offset per enemy spreads them across the width of the path; it is drawing only, the simulation is unchanged.
    const positions = state.enemies.map((enemy) => {
      const spread = ENEMIES[enemy.type].boss ? 0 : 7;
      return {
        enemy,
        x: enemy.prevX + (enemy.x - enemy.prevX) * alpha + (((enemy.id * 37) % 15) / 7 - 1) * spread,
        y: enemy.prevY + (enemy.y - enemy.prevY) * alpha + (((enemy.id * 53) % 15) / 7 - 1) * spread,
      };
    });
    for (const { enemy, x, y } of positions.sort((a, b) => a.y - b.y)) {
      drawEnemy(ctx, enemy, x, y, time);
      if (enemy.hp < enemy.maxHp && !ENEMIES[enemy.type].boss) {
        const width = Math.max(16, Math.round(enemyWidth(enemy.type) * 0.8));
        drawBar(ctx, x - width / 2, y - enemyExtent(enemy.type).above - 10, width, Math.max(0, enemy.hp / enemy.maxHp), '#4caf50');
      }
    }

    for (const projectile of state.projectiles) drawProjectile(ctx, projectile, alpha, time);

    const zoom = textZoom(canvas);
    effects.draw(ctx, zoom);
    drawHud(ctx, state, effects, zoom);
    effects.drawOverlay(ctx, WIDTH, HEIGHT, zoom);
  }

  return { draw };
}
