// The side panel for play: wave controls, the shop of towers and the selected tower.
// It only reads game state. Every change goes back through the handlers it is given.
import { RULES, TOWERS, TOWER_ORDER } from '../core/data.js';
import { towerSprite, TOWER_SPRITE } from '../render/sprites.js';

const SPEEDS = [1, 2, 4];
const TARGETING = [['first', 'First'], ['last', 'Last'], ['strong', 'Strong'], ['close', 'Close']];
const MESSAGE_SECONDS = 6;
const DEFAULT_MESSAGE = 'Pick a tower, then choose a free grass tile. Space starts the wave.';

export function el(tag, attributes = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (name === 'class') node.className = value;
    else if (name === 'text') node.textContent = value;
    else node.setAttribute(name, value);
  }
  node.append(...children);
  return node;
}

function drawIcon(canvas, type) {
  const sprite = towerSprite(type, 0, false);
  canvas.getContext('2d').drawImage(sprite, 0, 0);
}

function statsLine(type, tier) {
  const { stats } = TOWERS[type].tiers[tier];
  if (stats.payout) return `Pays ${stats.payout} gold at the end of every wave.`;
  return `Damage ${stats.damage}, every ${stats.interval} s, range ${stats.range} tiles.`;
}

/**
 * @param {HTMLElement} root
 * @param {{pick: (type: string) => void, startWave: () => void, setSpeed: (speed: number) => void,
 *   upgrade: () => void, sell: () => void, setTargeting: (targeting: string) => void}} handlers
 */
export function createPanel(root, handlers) {
  const startButton = el('button', { class: 'button primary', type: 'button', 'aria-keyshortcuts': 'Space' });
  startButton.addEventListener('click', handlers.startWave);

  const speedButtons = SPEEDS.map((speed) => {
    const button = el('button', { class: 'button', type: 'button', text: `${speed}x`, 'aria-label': `${speed}x speed` });
    button.addEventListener('click', () => handlers.setSpeed(speed));
    return [speed, button];
  });

  const message = el('p', { class: 'message', role: 'status', text: DEFAULT_MESSAGE });

  const shopButtons = TOWER_ORDER.map((type, index) => {
    const icon = el('canvas', { width: TOWER_SPRITE.width, height: TOWER_SPRITE.height, 'aria-hidden': 'true' });
    drawIcon(icon, type);
    const button = el(
      'button',
      { class: 'shop-item', type: 'button', 'aria-keyshortcuts': String((index + 1) % 10) },
      icon,
      el('span', { class: 'shop-name', text: TOWERS[type].name }),
      el('span', { class: 'shop-cost', text: `${TOWERS[type].cost} gold` }),
      el('span', { class: 'shop-key', 'aria-hidden': 'true', text: String((index + 1) % 10) }),
    );
    button.addEventListener('click', () => handlers.pick(type));
    return [type, button];
  });

  const selected = el('section', { class: 'selected', 'aria-label': 'Selected tower' });
  const play = el(
    'div',
    { class: 'play-panel' },
    el('div', { class: 'controls' }, startButton, el('div', { class: 'speeds', role: 'group', 'aria-label': 'Game speed' }, ...speedButtons.map(([, button]) => button))),
    message,
    el('h2', { class: 'panel-heading', text: 'Towers' }),
    el('div', { class: 'shop' }, ...shopButtons.map(([, button]) => button)),
    selected,
  );
  root.append(play);

  let messageTimer = 0;
  let lastKey = '';

  function say(text) {
    message.textContent = text || DEFAULT_MESSAGE;
    clearTimeout(messageTimer);
    if (text) messageTimer = setTimeout(() => { message.textContent = DEFAULT_MESSAGE; }, MESSAGE_SECONDS * 1000);
  }

  function renderSelected(game, tower) {
    selected.replaceChildren();
    if (!tower) {
      selected.append(el('p', { class: 'hint', text: 'Click a placed tower to upgrade or sell it.' }));
      return;
    }
    const definition = TOWERS[tower.type];
    const next = definition.tiers[tower.tier + 1];
    const upgrade = el('button', { class: 'button', type: 'button' });
    if (next) {
      upgrade.textContent = `Upgrade to ${next.name}: ${next.cost} gold`;
      if (game.gold < next.cost) upgrade.setAttribute('aria-disabled', 'true');
    } else {
      upgrade.textContent = 'Fully upgraded';
      upgrade.setAttribute('aria-disabled', 'true');
    }
    upgrade.addEventListener('click', handlers.upgrade);

    const sell = el('button', { class: 'button danger', type: 'button', text: `Sell for ${Math.floor(tower.spent * RULES.sellRefund)} gold` });
    sell.addEventListener('click', handlers.sell);

    selected.append(
      el('h2', { class: 'panel-heading', text: definition.name }),
      el('p', { class: 'tier-name', text: `Tier ${tower.tier}: ${definition.tiers[tower.tier].name}` }),
      el('p', { class: 'blurb', text: definition.blurb }),
      el('p', { class: 'stats', text: statsLine(tower.type, tower.tier) }),
      upgrade,
    );
    if (definition.damageType !== 'none') {
      const group = el('div', { class: 'segmented', role: 'group', 'aria-label': 'Targeting' });
      for (const [value, label] of TARGETING) {
        const button = el('button', { class: 'button', type: 'button', text: label, 'aria-pressed': String(tower.targeting === value) });
        button.addEventListener('click', () => handlers.setTargeting(value));
        group.append(button);
      }
      selected.append(el('p', { class: 'label', text: 'Targets the enemy that is' }), group);
    }
    selected.append(sell);
  }

  /**
   * @param {import('../core/contract.js').Game} game
   * @param {{placing: string | null, selectedId: number | null, speed: number, canStart: boolean}} ui
   */
  function sync(game, ui) {
    startButton.textContent = game.phase === 'wave' ? `Wave ${game.wave} under way` : `Start wave ${game.wave + 1}`;
    startButton.setAttribute('aria-disabled', String(!ui.canStart));
    for (const [speed, button] of speedButtons) button.setAttribute('aria-pressed', String(speed === ui.speed));
    for (const [type, button] of shopButtons) {
      button.classList.toggle('unaffordable', game.gold < TOWERS[type].cost);
      button.setAttribute('aria-pressed', String(ui.placing === type));
    }
    const tower = game.towers.find((candidate) => candidate.id === ui.selectedId) || null;
    const key = tower ? `${tower.id}|${tower.tier}|${tower.targeting}|${tower.spent}|${tower.tier < 3 ? game.gold >= TOWERS[tower.type].tiers[tower.tier + 1].cost : ''}` : 'none';
    if (key !== lastKey) {
      lastKey = key;
      renderSelected(game, tower);
    }
  }

  return { say, sync };
}
