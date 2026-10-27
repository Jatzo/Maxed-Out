// Short-lived visual feedback: hitsplats, puffs, floating gold, frost bursts and banners.
// It only reads game events and never touches game state.
import { drawText, textWidth } from '../render/font.js';
import { ENEMIES } from '../core/data.js';

const MAX_EFFECTS = 260;
const HITSPLAT_LIFE = 0.9;
const BOSS_BANNER_LIFE = 3;

// Rows of the splat as [left, top, width, height] on a 20 x 16 grid: a rounded blob, drawn twice for its border.
const SPLAT_ROWS = [[4, 0, 12, 2], [1, 2, 18, 3], [0, 5, 20, 6], [1, 11, 18, 3], [4, 14, 12, 2]];

function drawSplat(ctx, x, y, fill, border) {
  ctx.fillStyle = border;
  for (const [dx, dy, w, h] of SPLAT_ROWS) ctx.fillRect(x + dx - 1, y + dy - 1, w + 2, h + 2);
  ctx.fillStyle = fill;
  for (const [dx, dy, w, h] of SPLAT_ROWS) ctx.fillRect(x + dx, y + dy, w, h);
}

export function createEffects() {
  let list = [];
  let leakFlash = 0;
  let banner = null;

  const add = (effect) => {
    if (list.length >= MAX_EFFECTS) list.shift();
    list.push({ age: 0, ...effect });
  };

  function handle(events, game) {
    for (const event of events) {
      const { x, y, amount } = event;
      switch (event.type) {
        case 'hit':
          add({ kind: 'splat', x: x + (Math.random() - 0.5) * 12, y: y - 10, amount, life: HITSPLAT_LIFE });
          break;
        case 'kill':
          add({ kind: 'puff', x, y, life: 0.45 });
          break;
        case 'payout':
        case 'sell':
          add({ kind: 'text', x, y: y - 18, text: `+${amount}`, colour: '#e6c84f', life: 1.3 });
          break;
        case 'leak':
          leakFlash = 0.5;
          add({ kind: 'text', x: Math.min(x, 930), y: y - 18, text: `-${amount}`, colour: '#ff8a7a', life: 1.3 });
          break;
        case 'freeze':
          add({ kind: 'frost', x, y, life: 0.6 });
          break;
        case 'spell':
          if (event.damageType === 'ranged') add({ kind: 'blast', x, y, life: 0.4, radius: amount || 14 });
          else add({ kind: 'ring', x, y, life: 0.35, colour: '#e3d4ff', radius: amount || 14 });
          break;
        case 'place':
          add({ kind: 'puff', x, y: y + 8, life: 0.45 });
          break;
        case 'upgrade':
          add({ kind: 'sparkle', x, y, life: 0.8 });
          break;
        case 'boss': {
          const boss = game.enemies.find((enemy) => enemy.id === event.enemyId) || game.enemies.find((enemy) => ENEMIES[enemy.type].boss);
          banner = { text: boss ? `${ENEMIES[boss.type].name} approaches` : 'A dragon approaches', age: 0 };
          break;
        }
      }
    }
  }

  function update(dt) {
    list = list.filter((effect) => (effect.age += dt) < effect.life);
    leakFlash = Math.max(0, leakFlash - dt);
    if (banner && (banner.age += dt) > BOSS_BANNER_LIFE) banner = null;
  }

  // `zoom` enlarges text-bearing effects when the board is shown small, so numbers stay readable on a phone.
  function draw(ctx, zoom) {
    for (const effect of list) {
      const t = effect.age / effect.life;
      const x = Math.round(effect.x);
      const y = Math.round(effect.y);
      ctx.save();
      switch (effect.kind) {
        case 'splat': {
          ctx.globalAlpha = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
          ctx.translate(x, y - Math.round(t * 22 * zoom));
          ctx.scale(zoom, zoom);
          if (effect.amount === 0) drawSplat(ctx, -10, -8, '#3a7bd5', '#1d3f6b');
          else drawSplat(ctx, -10, -8, '#c0392b', '#6e1a14');
          drawText(ctx, String(effect.amount), 0, -7, { scale: 2, align: 'center', shadow: '#1b1712' });
          break;
        }
        case 'puff': {
          ctx.globalAlpha = 1 - t;
          for (let k = 0; k < 6; k++) {
            const angle = (k / 6) * Math.PI * 2;
            const reach = 4 + t * 16;
            const size = Math.round(6 - t * 4);
            ctx.fillStyle = k % 2 ? '#e8e0cc' : '#a89f8a';
            ctx.fillRect(Math.round(x + Math.cos(angle) * reach - size / 2), Math.round(y + Math.sin(angle) * reach * 0.8 - size / 2), size, size);
          }
          break;
        }
        case 'text': {
          ctx.globalAlpha = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
          ctx.translate(x, y - Math.round(t * 28 * zoom));
          ctx.scale(zoom, zoom);
          drawText(ctx, effect.text, 0, 0, { scale: 2, align: 'center', colour: effect.colour });
          break;
        }
        case 'frost': {
          ctx.globalAlpha = 1 - t;
          ctx.strokeStyle = '#bfefff';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x, y, 6 + t * 26, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = '#e8fbff';
          for (let k = 0; k < 8; k++) {
            const angle = (k / 8) * Math.PI * 2 + 0.4;
            const reach = 4 + t * 24;
            ctx.fillRect(Math.round(x + Math.cos(angle) * reach) - 1, Math.round(y + Math.sin(angle) * reach) - 1, 3, 3);
          }
          break;
        }
        // A bomb's burst: an orange flash that shrinks while a grey smoke ring spreads to the edge of the splash.
        case 'blast': {
          ctx.globalAlpha = 1 - t;
          ctx.fillStyle = '#f08a30';
          ctx.beginPath();
          ctx.arc(x, y, Math.max(2, effect.radius * 0.6 * (1 - t)), 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ffe08a';
          ctx.beginPath();
          ctx.arc(x, y, Math.max(1, effect.radius * 0.3 * (1 - t)), 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#8a8680';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(x, y, 4 + t * (effect.radius - 4), 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        case 'ring': {
          ctx.globalAlpha = 1 - t;
          ctx.strokeStyle = effect.colour;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x, y, 4 + t * (effect.radius - 4), 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        case 'sparkle': {
          ctx.globalAlpha = 1 - t;
          ctx.fillStyle = '#f6e27a';
          for (let k = 0; k < 6; k++) {
            ctx.fillRect(Math.round(x - 14 + k * 5), Math.round(y - 4 - t * 26 - (k % 2) * 8), 3, 3);
          }
          break;
        }
      }
      ctx.restore();
    }
  }

  function drawOverlay(ctx, width, height, zoom) {
    if (leakFlash > 0) {
      const strength = Math.min(1, leakFlash / 0.5);
      const gradient = ctx.createRadialGradient(width / 2, height / 2, height * 0.35, width / 2, height / 2, height * 0.85);
      gradient.addColorStop(0, 'rgba(192, 57, 43, 0)');
      gradient.addColorStop(1, `rgba(192, 57, 43, ${0.55 * strength})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    }
    if (banner) {
      const fade = banner.age < 0.3 ? banner.age / 0.3 : banner.age > BOSS_BANNER_LIFE - 0.5 ? (BOSS_BANNER_LIFE - banner.age) / 0.5 : 1;
      const boxWidth = textWidth(banner.text.toUpperCase(), 3) + 48;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.scale(zoom, zoom);
      const left = Math.round((width / zoom - boxWidth) / 2);
      const top = Math.round(96 / zoom);
      ctx.fillStyle = '#2a2118';
      ctx.fillRect(left, top, boxWidth, 44);
      ctx.fillStyle = '#c0392b';
      ctx.fillRect(left, top, boxWidth, 4);
      drawText(ctx, banner.text, width / zoom / 2, top + 14, { scale: 3, align: 'center', colour: '#e6c84f' });
      ctx.restore();
    }
  }

  return {
    handle,
    update,
    draw,
    drawOverlay,
    /** Moves every effect forward without removing any, for a still frame of the fixture. */
    age(seconds) {
      for (const effect of list) effect.age = Math.min(effect.life * 0.95, effect.age + seconds);
    },
    /** From 1 just after a leak down to 0, for the hitpoints orb to flash with. */
    leakStrength: () => Math.min(1, leakFlash / 0.5),
  };
}
