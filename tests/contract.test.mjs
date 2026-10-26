import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES } from '../src/core/data.js';
import { createGame } from '../src/core/sim.js';
import { midWaveState } from './fixtures/state-midwave.mjs';

const keysOf = (value) => Object.keys(value).sort();
const EVENT_KEYS = ['amount', 'damageType', 'enemyId', 'towerId', 'type', 'x', 'y'];

// A real game paused in the middle of a wave with every kind of thing on screen.
function midWaveGame() {
  const game = createGame(1);
  game.gold = 100000;
  const picks = [['ranger', 3], ['mage', 3], ['pure', 3], ['maxMage', 3], ['flipper', 0]];
  picks.forEach(([type, upgrades], index) => {
    const slot = game.map.slots[index * 2];
    game.place(type, slot.col, slot.row);
    const tower = game.towers[game.towers.length - 1];
    for (let i = 0; i < upgrades; i++) game.upgrade(tower.id);
  });
  game.wave = 14;
  game.startWave();
  const events = [];
  for (let i = 0; i < 900 && !(game.projectiles.length > 0 && game.enemies.length > 8); i++) {
    game.step(RULES.step);
    events.push(...game.drainEvents());
  }
  return { game, events };
}

test('a real mid-wave game has the same shapes as the fixture the renderer was built on', () => {
  const { game, events } = midWaveGame();
  assert.ok(game.towers.length > 0 && game.enemies.length > 0 && game.projectiles.length > 0);

  for (const key of keysOf(midWaveState)) {
    if (key !== 'events') assert.ok(key in game, `game is missing ${key}`);
  }
  assert.deepEqual(keysOf(game.map), keysOf(midWaveState.map));
  assert.deepEqual(keysOf(game.map.slots[0]), keysOf(midWaveState.map.slots[0]));
  assert.deepEqual(keysOf(game.map.path[0]), keysOf(midWaveState.map.path[0]));
  for (const tower of game.towers) assert.deepEqual(keysOf(tower), keysOf(midWaveState.towers[0]));
  for (const enemy of game.enemies) {
    assert.deepEqual(keysOf(enemy), keysOf(midWaveState.enemies[0]));
    assert.deepEqual(keysOf(enemy.mods), keysOf(midWaveState.enemies[0].mods));
  }
  for (const projectile of game.projectiles) assert.deepEqual(keysOf(projectile), keysOf(midWaveState.projectiles[0]));
  assert.ok(events.length > 0);
  for (const event of events) assert.ok(keysOf(event).every((key) => EVENT_KEYS.includes(key)), keysOf(event).join());
});

test('every projectile kind the simulation fires is one the renderer knows', () => {
  const known = new Set(midWaveState.projectiles.map((projectile) => projectile.kind));
  const { game } = midWaveGame();
  const seen = new Set();
  for (let i = 0; i < 1500 && game.phase === 'wave'; i++) {
    game.step(RULES.step);
    for (const projectile of game.projectiles) seen.add(projectile.kind);
  }
  assert.ok(seen.size > 0);
  for (const kind of seen) assert.ok(known.has(kind), `unknown kind ${kind}`);
});

test('the game plays through the Game methods the interface relies on', () => {
  const game = createGame(1);
  for (const method of ['step', 'place', 'canPlace', 'upgrade', 'sell', 'setTargeting', 'startWave', 'drainEvents']) {
    assert.equal(typeof game[method], 'function', method);
  }
  assert.equal(game.phase, 'build');
  assert.equal(game.gold, RULES.startGold);
  assert.equal(game.lives, RULES.startLives);
  assert.equal(game.wave, 0);
});
