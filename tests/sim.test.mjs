import test from 'node:test';
import assert from 'node:assert/strict';
import { ENEMIES, RULES, TILE } from '../src/core/data.js';
import { createGame } from '../src/core/sim.js';

const DT = RULES.step;
const HUGE = 1e9;

// A game with plenty of gold, already in the wave phase so that steps do something. Wave 1 spawns chickens from
// the start of the path, which is far from every spot the tests build on.
function waveGame() {
  const game = createGame(1);
  game.gold = 1e7;
  game.lives = 1e6;
  game.startWave();
  game.drainEvents();
  return game;
}

function pointAt(game, progress) {
  let remaining = progress;
  for (let i = 1; i < game.map.path.length; i++) {
    const from = game.map.path[i - 1];
    const to = game.map.path[i];
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (remaining <= length) {
      const t = remaining / length;
      return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
    }
    remaining -= length;
  }
  return game.map.path[game.map.path.length - 1];
}

// The grass tile closest to the path, and the progress of the path point nearest to it. The map is the same in
// every game, so it is worked out once.
let cachedSpot = null;
function closestSpot(game) {
  cachedSpot ??= findClosestSpot(game);
  return cachedSpot;
}

// Grass tiles within a given distance of a path point, nearest first, leaving out the tile already used.
function nearbySlots(game, progress, used, radius = 1.5 * TILE) {
  const point = pointAt(game, progress);
  return game.map.slots
    .filter((slot) => slot !== used && Math.hypot(slot.col * TILE + TILE / 2 - point.x, slot.row * TILE + TILE / 2 - point.y) <= radius);
}

function findClosestSpot(game) {
  const distances = (slot) => {
    const x = slot.col * TILE + TILE / 2;
    const y = slot.row * TILE + TILE / 2;
    const found = [];
    for (let progress = 0; progress < game.map.pathLength; progress += 2) {
      const point = pointAt(game, progress);
      found.push({ progress, distance: Math.hypot(point.x - x, point.y - y) });
    }
    return found;
  };
  let best = null;
  for (const slot of game.map.slots) {
    const nearest = Math.min(...distances(slot).map((entry) => entry.distance));
    if (!best || nearest < best.distance - 1e-9) best = { slot, distance: nearest };
  }
  // Use the middle of the straight stretch that sits alongside the tile, so neighbours either side are on the
  // same straight and not round a corner.
  const alongside = distances(best.slot).filter((entry) => entry.distance < best.distance + 0.01);
  return { slot: best.slot, distance: best.distance, progress: alongside[Math.floor(alongside.length / 2)].progress };
}

let enemyCounter = 9000;
function addEnemy(game, type, progress, overrides = {}) {
  const point = pointAt(game, progress);
  const hp = overrides.hp ?? HUGE;
  const enemy = {
    id: enemyCounter++, type, mods: { armoured: false, warded: false }, x: point.x, y: point.y,
    prevX: point.x, prevY: point.y, maxHp: hp, progress, slow: 0, frozenFor: 0, dir: 1, ...overrides, hp,
  };
  game.enemies.push(enemy);
  return enemy;
}

function build(game, type, slot, upgrades = 0) {
  assert.equal(game.place(type, slot.col, slot.row).ok, true);
  const tower = game.towers.find((candidate) => candidate.col === slot.col && candidate.row === slot.row);
  for (let i = 0; i < upgrades; i++) assert.equal(game.upgrade(tower.id).ok, true);
  return tower;
}

function stepFor(game, seconds, onStep) {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    game.step(DT);
    if (onStep) onStep();
  }
}

function hitsOn(events, enemy) {
  return events.filter((event) => event.type === 'hit' && event.enemyId === enemy.id);
}

test('placing a tower costs gold and a refused placement says why', () => {
  const game = createGame(1);
  const spot = closestSpot(game).slot;
  assert.deepEqual(game.place('pure', spot.col, spot.row), { ok: true });
  assert.equal(game.gold, RULES.startGold - 150);
  assert.deepEqual(game.place('pure', spot.col, spot.row), { ok: false, reason: 'Something is already built there' });
  assert.deepEqual(game.place('pure', 5, 5), { ok: false, reason: 'Cannot build on the path' });
  assert.equal(game.place('pure', 19, 5).ok, false);
  const other = game.map.slots[10];
  game.gold = 100;
  assert.deepEqual(game.place('pure', other.col, other.row), { ok: false, reason: 'Not enough gold' });
  assert.equal(game.canPlace('pure', other.col, other.row), false);
  game.gold = 1000;
  assert.equal(game.canPlace('pure', other.col, other.row), true);
});

test('upgrading charges the next tier and stops at tier 3', () => {
  const game = createGame(1);
  game.gold = 10000;
  const tower = build(game, 'pure', closestSpot(game).slot);
  assert.equal(game.upgrade(tower.id).ok, true);
  assert.equal(tower.tier, 1);
  assert.equal(game.gold, 10000 - 150 - 100);
  game.upgrade(tower.id);
  game.upgrade(tower.id);
  assert.equal(tower.tier, 3);
  assert.equal(tower.spent, 150 + 100 + 250 + 600);
  assert.deepEqual(game.upgrade(tower.id), { ok: false, reason: 'Already fully upgraded' });
  game.gold = 0;
  tower.tier = 0;
  assert.deepEqual(game.upgrade(tower.id), { ok: false, reason: 'Not enough gold' });
});

test('selling refunds seventy per cent of everything spent, rounded down', () => {
  const game = createGame(1);
  game.gold = 10000;
  const tower = build(game, 'pure', closestSpot(game).slot, 1);
  const before = game.gold;
  assert.deepEqual(game.sell(tower.id), { ok: true, refund: 175 });
  assert.equal(game.gold, before + 175);
  assert.equal(game.towers.length, 0);
  assert.equal(game.sell(tower.id).ok, false);
});

test('physical damage is reduced by armour but never below one', () => {
  const game = waveGame();
  const { slot, progress } = closestSpot(game);
  build(game, 'pure', slot);
  const guard = addEnemy(game, 'guard', progress);
  game.step(DT);
  assert.equal(hitsOn(game.drainEvents(), guard)[0].amount, 1);
  assert.equal(guard.hp, HUGE - 1);
});

test('physical damage subtracts armour, and the armoured modifier adds five', () => {
  for (const [armoured, expected] of [[false, 14 - 4], [true, 14 - 9]]) {
    const game = waveGame();
    const { slot, progress } = closestSpot(game);
    build(game, 'zerker', slot);
    const guard = addEnemy(game, 'guard', progress, { mods: { armoured, warded: false } });
    game.step(DT);
    assert.equal(hitsOn(game.drainEvents(), guard)[0].amount, expected);
  }
});

test('magic ignores armour', () => {
  const game = waveGame();
  const { slot, progress } = closestSpot(game);
  build(game, 'mage', slot);
  const knight = addEnemy(game, 'blackKnight', progress, { mods: { armoured: true, warded: false } });
  const events = [];
  stepFor(game, 1, () => events.push(...game.drainEvents()));
  assert.equal(hitsOn(events, knight)[0].amount, 8);
});

test('bosses take less from magic and more from a boss-slaying weapon', () => {
  const game = waveGame();
  const { slot, progress } = closestSpot(game);
  build(game, 'mage', slot);
  const dragon = addEnemy(game, 'dragonGreen', progress);
  const events = [];
  stepFor(game, 1, () => events.push(...game.drainEvents()));
  assert.equal(hitsOn(events, dragon)[0].amount, 8 * RULES.bossMagicTaken);

  const second = waveGame();
  const spot = closestSpot(second);
  build(second, 'ranger', spot.slot, 3);
  const target = addEnemy(second, 'dragonGreen', spot.progress);
  const secondEvents = [];
  stepFor(second, 1, () => secondEvents.push(...second.drainEvents()));
  assert.equal(hitsOn(secondEvents, target)[0].amount, 18 * 2 - ENEMIES.dragonGreen.armour);
});

test('a warded enemy takes nothing from magic and cannot be frozen', () => {
  const game = waveGame();
  const { slot, progress } = closestSpot(game);
  build(game, 'mage', slot, 2);
  const warded = addEnemy(game, 'goblin', progress, { mods: { armoured: false, warded: true } });
  const events = [];
  stepFor(game, 3, () => {
    events.push(...game.drainEvents());
    warded.progress = progress;
  });
  const hits = hitsOn(events, warded);
  assert.ok(hits.length > 0);
  assert.ok(hits.every((hit) => hit.amount === 0));
  assert.equal(warded.hp, HUGE);
  assert.equal(events.filter((event) => event.type === 'freeze').length, 0);
});

test('slow does not stack: the strongest aura wins', () => {
  const game = waveGame();
  const { slot, progress } = closestSpot(game);
  const [first, second] = nearbySlots(game, progress, slot);
  build(game, 'tank', slot);
  build(game, 'tank', first, 2);
  build(game, 'tank', second, 0);
  const cow = addEnemy(game, 'cow', progress);
  game.step(DT);
  assert.equal(cow.slow, 0.5);
});

test('two tanks of the same tier slow by one tier, not two', () => {
  const game = waveGame();
  const { slot, progress } = closestSpot(game);
  build(game, 'tank', slot);
  build(game, 'tank', nearbySlots(game, progress, slot)[0]);
  const cow = addEnemy(game, 'cow', progress);
  game.step(DT);
  assert.equal(cow.slow, 0.3);
});

test('slow is halved on bosses and zero for enemies out of reach', () => {
  const game = waveGame();
  const { slot, progress } = closestSpot(game);
  build(game, 'tank', slot, 2);
  const dragon = addEnemy(game, 'dragonGreen', progress);
  const far = addEnemy(game, 'cow', progress + 300);
  game.step(DT);
  assert.equal(dragon.slow, 0.5 * RULES.bossSlowFactor);
  assert.equal(far.slow, 0);
});

test('armour break lowers the armour the aura reaches', () => {
  const game = waveGame();
  const { slot, progress } = closestSpot(game);
  build(game, 'tank', slot, 3);
  const zerker = build(game, 'zerker', nearbySlots(game, progress, slot)[0]);
  const guard = addEnemy(game, 'guard', progress);
  game.step(DT);
  const hit = game.drainEvents().find((event) => event.type === 'hit' && event.towerId === zerker.id);
  assert.equal(hit.amount, 14 - (ENEMIES.guard.armour - 2));
});

function freezeTimes(game, enemy, progress, seconds) {
  const times = [];
  stepFor(game, seconds, () => {
    for (const event of game.drainEvents()) if (event.type === 'freeze' && event.enemyId === enemy.id) times.push(game.time);
    if (enemy.frozenFor === 0) enemy.progress = progress;
  });
  return times;
}

test('a thawed enemy cannot be frozen again until the immunity runs out', () => {
  const game = waveGame();
  const { slot, progress } = closestSpot(game);
  build(game, 'mage', slot, 2);
  const giant = addEnemy(game, 'hillGiant', progress);
  const times = freezeTimes(game, giant, progress, 12);
  assert.ok(times.length >= 3, `froze ${times.length} times`);
  for (let i = 1; i < times.length; i++) {
    assert.ok(times[i] - times[i - 1] >= 1 + RULES.freezeImmunity - 2 * DT, `gap ${times[i] - times[i - 1]}`);
  }
});

test('a boss is frozen for no longer than the boss limit', () => {
  const game = waveGame();
  const { slot, progress } = closestSpot(game);
  build(game, 'mage', slot, 2);
  const dragon = addEnemy(game, 'dragonGreen', progress);
  let longest = 0;
  stepFor(game, 8, () => {
    longest = Math.max(longest, dragon.frozenFor);
    game.drainEvents();
    dragon.progress = progress;
  });
  assert.ok(longest > 0, 'the boss was never frozen');
  assert.ok(longest <= RULES.bossFreezeMax + 1e-9, `longest freeze ${longest}`);
});

test('a frozen enemy does not move', () => {
  const game = waveGame();
  const { progress } = closestSpot(game);
  const goblin = addEnemy(game, 'goblin', progress, { frozenFor: 0.5 });
  const frozenAt = goblin.progress;
  stepFor(game, 0.4);
  assert.equal(goblin.progress, frozenAt);
  stepFor(game, 0.4);
  assert.ok(goblin.progress > frozenAt);
});

test('a tower strikes the target its mode asks for', () => {
  const expected = { first: 'ahead', last: 'behind', strong: 'behind', close: 'middle' };
  for (const [mode, label] of Object.entries(expected)) {
    const game = waveGame();
    const { slot, progress } = closestSpot(game);
    const tower = build(game, 'pure', slot);
    game.setTargeting(tower.id, mode);
    const behind = addEnemy(game, 'cow', progress - 12, { hp: 500 });
    const middle = addEnemy(game, 'cow', progress, { hp: 100 });
    const ahead = addEnemy(game, 'cow', progress + 12, { hp: 300 });
    game.step(DT);
    const struck = game.drainEvents().find((event) => event.type === 'hit');
    const names = { [behind.id]: 'behind', [middle.id]: 'middle', [ahead.id]: 'ahead' };
    assert.equal(names[struck.enemyId], label, `mode ${mode}`);
  }
});

test('a tower ignores enemies out of range', () => {
  const game = waveGame();
  const { slot, progress } = closestSpot(game);
  build(game, 'pure', slot);
  const far = addEnemy(game, 'cow', progress + 250);
  stepFor(game, 1);
  assert.equal(hitsOn(game.drainEvents(), far).length, 0);
  assert.equal(far.hp, HUGE);
});

test('a ranger with pierce hits a second enemy standing in line with its target', () => {
  const game = waveGame();
  const { slot, progress } = closestSpot(game);
  build(game, 'ranger', slot, 2);
  const front = addEnemy(game, 'cow', progress);
  const back = addEnemy(game, 'cow', progress + 14);
  const events = [];
  stepFor(game, 1, () => events.push(...game.drainEvents()));
  assert.ok(hitsOn(events, front).length > 0);
  assert.ok(hitsOn(events, back).length > 0);
});

test('a splash spell hits neighbours of the target', () => {
  const game = waveGame();
  const { slot, progress } = closestSpot(game);
  build(game, 'mage', slot, 2);
  const target = addEnemy(game, 'cow', progress);
  const neighbour = addEnemy(game, 'cow', progress + 20);
  const faraway = addEnemy(game, 'cow', progress + 200);
  const events = [];
  stepFor(game, 1.5, () => {
    events.push(...game.drainEvents());
    target.progress = progress;
    neighbour.progress = progress + 20;
  });
  assert.ok(hitsOn(events, neighbour).length > 0);
  assert.equal(hitsOn(events, faraway).length, 0);
});

test('a kill pays the bounty, and each modifier multiplies it', () => {
  const game = waveGame();
  const { slot, progress } = closestSpot(game);
  build(game, 'zerker', slot);
  const before = game.gold;
  addEnemy(game, 'cow', progress, { hp: 1, mods: { armoured: true, warded: true } });
  game.step(DT);
  const kill = game.drainEvents().find((event) => event.type === 'kill');
  const expected = Math.round(ENEMIES.cow.bounty * RULES.modifierBountyMultiplier ** 2);
  assert.equal(kill.amount, expected);
  assert.equal(game.gold, before + expected);
});

test('a wave with nothing built leaks, pays the wave bonus and each flipper payout, then returns to build', () => {
  const game = createGame(1);
  game.gold = 10000;
  const tower = build(game, 'flipper', closestSpot(game).slot);
  const before = game.gold;
  game.startWave();
  game.drainEvents();
  const events = [];
  for (let i = 0; i < 5000 && game.phase === 'wave'; i++) {
    game.step(DT);
    events.push(...game.drainEvents());
  }
  assert.equal(game.phase, 'build');
  assert.equal(game.wave, 1);
  assert.equal(game.lives, RULES.startLives - 14);
  assert.equal(game.gold, before + RULES.waveBonusBase + RULES.waveBonusPerWave * 1 + 60);
  const payout = events.find((event) => event.type === 'payout');
  assert.equal(payout.amount, 60);
  assert.equal(payout.towerId, tower.id);
  assert.equal(payout.x, tower.x);
  assert.ok(events.some((event) => event.type === 'waveEnd'));
});

test('losing every life ends the game', () => {
  const game = createGame(1);
  game.lives = 3;
  game.startWave();
  for (let i = 0; i < 5000 && game.phase === 'wave'; i++) game.step(DT);
  assert.equal(game.phase, 'lost');
  assert.equal(game.lives, 0);
  assert.equal(game.startWave(), false);
});

test('clearing the final wave wins, and freeplay can carry on from there', () => {
  const game = createGame(1);
  game.lives = 1e6;
  game.wave = RULES.winWave - 1;
  assert.equal(game.startWave(), true);
  for (let i = 0; i < 20000 && game.phase === 'wave'; i++) game.step(DT);
  assert.equal(game.phase, 'won');
  assert.equal(game.wave, RULES.winWave);
  assert.equal(game.startWave(), true);
  assert.equal(game.wave, RULES.winWave + 1);
  assert.equal(game.phase, 'wave');
});

test('a wave cannot be started while one is running', () => {
  const game = createGame(1);
  assert.equal(game.startWave(), true);
  assert.equal(game.startWave(), false);
  assert.equal(game.wave, 1);
});

test('draining events returns them once and then nothing', () => {
  const game = createGame(1);
  const { slot } = closestSpot(game);
  game.place('pure', slot.col, slot.row);
  assert.equal(game.drainEvents().length, 1);
  assert.equal(game.drainEvents().length, 0);
});

test('the same seed and the same moves give the same game', () => {
  const play = () => {
    const game = createGame(4);
    game.gold = 5000;
    const slots = game.map.slots;
    for (let i = 0; i < 6; i++) game.place(i % 2 ? 'ranger' : 'pure', slots[i * 3].col, slots[i * 3].row);
    game.wave = 14;
    for (let wave = 0; wave < 3; wave++) {
      game.startWave();
      for (let i = 0; i < 4000 && game.phase === 'wave'; i++) game.step(DT);
    }
    return { gold: game.gold, lives: game.lives, wave: game.wave, time: game.time, phase: game.phase };
  };
  assert.deepEqual(play(), play());
});

test('a scythe strikes three enemies at once', () => {
  const game = waveGame();
  const { slot, progress } = closestSpot(game);
  build(game, 'maxMelee', slot, 2);
  const enemies = [0, 10, 20].map((offset) => addEnemy(game, 'cow', progress - offset));
  const events = [];
  stepFor(game, 0.2, () => events.push(...game.drainEvents()));
  for (const enemy of enemies) assert.ok(hitsOn(events, enemy).length > 0);
});

test('a cleaving zerker hits a neighbour of its target for half damage', () => {
  const game = waveGame();
  const { slot, progress } = closestSpot(game);
  build(game, 'zerker', slot, 3);
  const target = addEnemy(game, 'cow', progress);
  const neighbour = addEnemy(game, 'cow', progress - 16);
  const events = [];
  stepFor(game, 0.2, () => events.push(...game.drainEvents()));
  assert.deepEqual(hitsOn(events, target).map((event) => event.amount), [32]);
  assert.deepEqual(hitsOn(events, neighbour).map((event) => event.amount), [16]);
});

test('a stone maul lands a special hit on every fifth attack', () => {
  const game = waveGame();
  const { slot, progress } = closestSpot(game);
  build(game, 'pure', slot, 3);
  const target = addEnemy(game, 'cow', progress);
  const events = [];
  stepFor(game, 2.6, () => {
    events.push(...game.drainEvents());
    target.progress = progress;
  });
  const amounts = hitsOn(events, target).map((event) => event.amount);
  assert.deepEqual(amounts.slice(0, 5), [9, 9, 9, 9, 40]);
});

test('twinshot fires one arrow at each of two targets', () => {
  const game = waveGame();
  const { slot, progress } = closestSpot(game);
  build(game, 'maxRanger', slot, 3);
  addEnemy(game, 'cow', progress);
  addEnemy(game, 'cow', progress - 40);
  game.step(DT);
  assert.equal(game.projectiles.length, 2);
});

test('storm crown lightning jumps to an enemy beyond its splash', () => {
  const game = waveGame();
  const { slot, progress } = closestSpot(game);
  build(game, 'maxMage', slot, 3);
  const target = addEnemy(game, 'cow', progress);
  const beyondSplash = addEnemy(game, 'cow', progress - 80);
  const events = [];
  stepFor(game, 0.5, () => {
    events.push(...game.drainEvents());
    target.progress = progress;
    beyondSplash.progress = progress - 80;
  });
  assert.equal(hitsOn(events, target).length, 1);
  assert.ok(hitsOn(events, beyondSplash).length > 0);
});
