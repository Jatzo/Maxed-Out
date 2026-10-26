import test from 'node:test';
import assert from 'node:assert/strict';
import { BOSS_WAVES, ENEMIES, MODIFIERS, OPENING_WAVES, RULES, WAVE_FORMULA } from '../src/core/data.js';
import { createRng } from '../src/core/rng.js';
import { buildWave } from '../src/core/waves.js';

const wave = (number, seed = 1) => buildWave(number, createRng(seed));
const bossGroups = (groups) => groups.filter((group) => ENEMIES[group.type].boss);
const regularCount = (groups) => groups.filter((group) => !ENEMIES[group.type].boss)
  .reduce((total, group) => total + group.count, 0);

test('waves 1 to 10 follow the hand-written opening', () => {
  for (let number = 1; number <= 10; number++) {
    const groups = wave(number);
    assert.deepEqual(
      groups.map(({ type, count, gap, delay }) => ({ type, count, gap, delay })),
      OPENING_WAVES[number - 1],
    );
    assert.ok(groups.every((group) => group.hpMultiplier === 1));
  }
});

test('bosses arrive on waves 10, 20, 30 and 40 and on no other wave up to 40', () => {
  for (let number = 1; number <= RULES.winWave; number++) {
    const bosses = bossGroups(wave(number));
    if (BOSS_WAVES[number]) {
      assert.equal(bosses.length, 1, `wave ${number}`);
      assert.equal(bosses[0].type, BOSS_WAVES[number]);
      assert.equal(bosses[0].count, 1);
    } else {
      assert.equal(bosses.length, 0, `wave ${number}`);
    }
  }
});

test('in freeplay a boss comes every ten waves and the colours cycle', () => {
  assert.equal(bossGroups(wave(50))[0].type, 'dragonGreen');
  assert.equal(bossGroups(wave(60))[0].type, 'dragonBlue');
  assert.equal(bossGroups(wave(70))[0].type, 'dragonRed');
  assert.equal(bossGroups(wave(80))[0].type, 'dragonBlack');
  assert.equal(bossGroups(wave(90))[0].type, 'dragonGreen');
  assert.equal(bossGroups(wave(55)).length, 0);
});

test('the enemy count follows the formula and is capped', () => {
  assert.equal(regularCount(wave(11)), Math.round(WAVE_FORMULA.countBase * WAVE_FORMULA.countGrowth));
  for (let number = 11; number <= 300; number++) {
    assert.ok(regularCount(wave(number)) <= WAVE_FORMULA.countCap, `wave ${number}`);
  }
  assert.equal(regularCount(wave(300)), WAVE_FORMULA.countCap);
});

test('hit points grow each wave and grow faster again after the final wave', () => {
  const multiplier = (number) => wave(number).find((group) => !ENEMIES[group.type].boss).hpMultiplier;
  assert.ok(Math.abs(multiplier(11) - WAVE_FORMULA.hpGrowth) < 1e-9);
  assert.ok(Math.abs(multiplier(40) - WAVE_FORMULA.hpGrowth ** 30) < 1e-9);
  const expectedAfterWin = WAVE_FORMULA.hpGrowth ** 31 * RULES.freeplayHpGrowth;
  assert.ok(Math.abs(multiplier(41) - expectedAfterWin) < 1e-9);
});

test('a boss keeps its own hit points until freeplay, then grows with it', () => {
  assert.equal(bossGroups(wave(40))[0].hpMultiplier, 1);
  assert.ok(Math.abs(bossGroups(wave(50))[0].hpMultiplier - RULES.freeplayHpGrowth ** 10) < 1e-9);
});

test('only enemies that have already arrived can appear', () => {
  for (let number = 11; number <= 60; number++) {
    for (const group of wave(number)) {
      if (!ENEMIES[group.type].boss) assert.ok(ENEMIES[group.type].unlock <= number, `${group.type} on wave ${number}`);
    }
  }
});

test('modifier chances are zero before their first wave, then rise and stop at the cap', () => {
  const chances = (number) => wave(number).find((group) => !ENEMIES[group.type].boss);
  assert.equal(chances(13).armouredChance, 0);
  assert.equal(chances(13).wardedChance, 0);
  assert.equal(chances(MODIFIERS.armoured.fromWave).armouredChance, WAVE_FORMULA.modifierChanceStart);
  assert.equal(chances(MODIFIERS.warded.fromWave - 1).wardedChance, 0);
  assert.equal(chances(MODIFIERS.warded.fromWave).wardedChance, WAVE_FORMULA.modifierChanceStart);
  assert.ok(chances(MODIFIERS.armoured.fromWave + 2).armouredChance > WAVE_FORMULA.modifierChanceStart);
  assert.equal(chances(200).armouredChance, WAVE_FORMULA.modifierChanceCap);
});

test('the gap between spawns shrinks to a floor and every group starts after the one before', () => {
  const groups = wave(40).filter((group) => !ENEMIES[group.type].boss);
  assert.ok(groups.every((group) => group.gap >= WAVE_FORMULA.gapMin));
  assert.equal(wave(200).find((group) => !ENEMIES[group.type].boss).gap, WAVE_FORMULA.gapMin);
  for (let i = 1; i < groups.length; i++) assert.ok(groups[i].delay >= groups[i - 1].delay);
});

test('the same seed builds the same wave', () => {
  assert.deepEqual(wave(33, 9), wave(33, 9));
});
