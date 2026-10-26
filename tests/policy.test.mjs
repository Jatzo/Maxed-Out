import test from 'node:test';
import assert from 'node:assert/strict';
import { GA, RULES, TOWER_ORDER } from '../src/core/data.js';
import { createGame } from '../src/core/sim.js';
import { REFERENCE_GENOME, createPolicy } from '../src/core/policy.js';

const gene = (type, slot) => ({ type, slot });

function towerAtSlot(game, slotIndex) {
  const slot = game.map.slots[slotIndex];
  return game.towers.find((tower) => tower.col === slot.col && tower.row === slot.row);
}

test('an empty slot gets the gene tower', () => {
  const game = createGame(1);
  createPolicy([gene('pure', 4)]).act(game);
  assert.equal(towerAtSlot(game, 4).type, 'pure');
});

test('an occupied slot is upgraded whatever stands there', () => {
  const game = createGame(1);
  game.gold = 5000;
  createPolicy([gene('pure', 2), gene('mage', 2)]).act(game);
  const tower = towerAtSlot(game, 2);
  assert.equal(tower.type, 'pure');
  assert.ok(tower.tier >= 1);
  assert.equal(game.towers.length, 1);
});

test('the policy stops at the first purchase it cannot afford and carries on from there next time', () => {
  const game = createGame(1);
  const policy = createPolicy([gene('pure', 0), gene('maxMelee', 1), gene('pure', 2)]);
  policy.act(game);
  assert.equal(game.towers.length, 1);
  assert.ok(towerAtSlot(game, 0));
  assert.equal(game.gold, RULES.startGold - 150);

  game.gold += 5000;
  policy.act(game);
  assert.equal(towerAtSlot(game, 1).type, 'maxMelee');
  assert.equal(towerAtSlot(game, 2).type, 'pure');
});

test('the list loops when exhausted and stops once every tower is fully upgraded', () => {
  const game = createGame(1);
  game.gold = 100000;
  createPolicy([gene('pure', 0), gene('ranger', 1)]).act(game);
  assert.equal(towerAtSlot(game, 0).tier, 3);
  assert.equal(towerAtSlot(game, 1).tier, 3);
  assert.equal(game.towers.length, 2);
});

test('a tower at tier 3 is skipped, not retried', () => {
  const game = createGame(1);
  game.gold = 100000;
  const spent = game.gold;
  createPolicy([gene('pure', 0)]).act(game);
  assert.equal(spent - game.gold, 150 + 100 + 250 + 600);
});

test('the reference genome is valid for the genetic algorithm', () => {
  assert.ok(REFERENCE_GENOME.length <= GA.genomeLength);
  for (const entry of REFERENCE_GENOME) {
    assert.ok(TOWER_ORDER.includes(entry.type));
    assert.ok(Number.isInteger(entry.slot) && entry.slot >= 0 && entry.slot < GA.slotCount);
  }
});
