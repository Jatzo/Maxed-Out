// A sprite sheet of every tower at every tier and every enemy with its overlays, for checking the art by eye.
import { TOWERS, TOWER_ORDER, ENEMIES } from '../core/data.js';
import { drawText, wrapText } from '../render/font.js';
import { towerSprite, drawEnemy, TOWER_SPRITE } from '../render/sprites.js';

const SHEET_WIDTH = 1440;
const SHEET_HEIGHT = 1760;

const LABEL_WIDTH = 100;
const CELL_WIDTH = 148;
const TOWER_ROW_HEIGHT = 190;
const ENEMY_ROW_HEIGHT = 150;
const DRAGON_ROW_HEIGHT = 124;
// A fixed instant, chosen so the warded pulse is bright and the frost glint is showing.
const SHEET_TIME = 0.5;

const REGULAR = Object.keys(ENEMIES).filter((type) => !ENEMIES[type].boss);
const DRAGONS = Object.keys(ENEMIES).filter((type) => ENEMIES[type].boss);

const VARIANTS = [
  ['Plain', {}],
  ['Armoured', { mods: { armoured: true, warded: false } }],
  ['Warded', { mods: { armoured: false, warded: true } }],
  ['Frozen', { frozenFor: 1 }],
];

const enemyAt = (id, type, extra = {}) => ({
  id, type, mods: { armoured: false, warded: false }, progress: 0, slow: 0, frozenFor: 0, dir: 1, ...extra,
});

function heading(ctx, text, y) {
  drawText(ctx, text, 12, y, { scale: 3, colour: '#e6c84f' });
}

function centred(ctx, text, x, y, colour = '#f1e6c8') {
  drawText(ctx, text, x, y, { align: 'center', colour });
}

export function drawSheet(canvas) {
  canvas.width = SHEET_WIDTH;
  canvas.height = SHEET_HEIGHT;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#2a2118';
  ctx.fillRect(0, 0, SHEET_WIDTH, SHEET_HEIGHT);

  heading(ctx, 'Towers', 10);
  TOWER_ORDER.forEach((type, column) => {
    const cellX = LABEL_WIDTH + column * CELL_WIDTH + CELL_WIDTH / 2;
    centred(ctx, TOWERS[type].name, cellX, 40, '#e6c84f');
    TOWERS[type].tiers.forEach((tier, row) => {
      const top = 62 + row * TOWER_ROW_HEIGHT;
      const sprite = towerSprite(type, row, false);
      ctx.drawImage(sprite, cellX - TOWER_SPRITE.width, top, TOWER_SPRITE.width * 2, TOWER_SPRITE.height * 2);
      wrapText(tier.name, 11).forEach((line, index) => centred(ctx, line, cellX, top + TOWER_SPRITE.height * 2 + 6 + index * 16, '#c8b48a'));
    });
  });
  for (let row = 0; row < 4; row++) drawText(ctx, `Tier ${row}`, 8, 62 + row * TOWER_ROW_HEIGHT + TOWER_SPRITE.height, { colour: '#c8b48a' });

  const enemiesTop = 62 + 4 * TOWER_ROW_HEIGHT + 8;
  heading(ctx, 'Enemies', enemiesTop);
  REGULAR.forEach((type, column) => {
    const cellX = LABEL_WIDTH + column * CELL_WIDTH + CELL_WIDTH / 2;
    centred(ctx, ENEMIES[type].name, cellX, enemiesTop + 30, '#e6c84f');
    VARIANTS.forEach(([, extra], row) => {
      // Drawn at double size: the game scale is too small to judge the overlays by eye.
      ctx.save();
      ctx.translate(cellX, enemiesTop + 134 + row * ENEMY_ROW_HEIGHT);
      ctx.scale(2, 2);
      drawEnemy(ctx, enemyAt(column, type, extra), 0, 0, SHEET_TIME);
      ctx.restore();
    });
  });
  VARIANTS.forEach(([label], row) => drawText(ctx, label, 8, enemiesTop + 126 + row * ENEMY_ROW_HEIGHT, { colour: '#c8b48a' }));

  const dragonsTop = enemiesTop + 50 + 4 * ENEMY_ROW_HEIGHT;
  heading(ctx, 'Dragons, wings up and down', dragonsTop);
  DRAGONS.forEach((type, column) => {
    centred(ctx, ENEMIES[type].name, LABEL_WIDTH + column * 2 * CELL_WIDTH + CELL_WIDTH, dragonsTop + 30, '#e6c84f');
    for (let frame = 0; frame < 2; frame++) {
      const cellX = LABEL_WIDTH + (column * 2 + frame) * CELL_WIDTH + CELL_WIDTH / 2;
      drawEnemy(ctx, enemyAt(frame, type), cellX, dragonsTop + 40 + DRAGON_ROW_HEIGHT / 2, SHEET_TIME);
    }
  });
}
