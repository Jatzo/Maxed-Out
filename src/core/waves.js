import { BOSS_WAVES, ENEMIES, MODIFIERS, OPENING_WAVES, RULES, WAVE_FORMULA } from './data.js';

// A boss walks in a few seconds after the first of the wave, as it does on wave 10.
const BOSS_DELAY = 6;
const BOSS_COLOURS = Object.values(BOSS_WAVES);
const REGULAR_TYPES = Object.keys(ENEMIES).filter((type) => !ENEMIES[type].boss);

/**
 * One spawn group: `count` enemies of `type`, `gap` seconds apart, starting `delay` seconds into the wave.
 * hpMultiplier scales the base hit points. The two chances are rolled once per enemy when it spawns.
 * @typedef {{type: string, count: number, gap: number, delay: number, hpMultiplier: number,
 *   armouredChance: number, wardedChance: number}} SpawnGroup
 */

/**
 * Builds the spawn groups for a wave. Waves 1 to 10 are hand written, later ones come from WAVE_FORMULA, and every
 * tenth wave brings a boss (the colours cycle once the final wave is past).
 * @returns {SpawnGroup[]}
 */
export function buildWave(waveNumber, rng) {
  const freeplayGrowth = waveNumber > RULES.winWave ? RULES.freeplayHpGrowth ** (waveNumber - RULES.winWave) : 1;
  if (waveNumber <= OPENING_WAVES.length) return openingGroups(waveNumber);

  const groups = formulaGroups(waveNumber, rng, freeplayGrowth);
  const boss = bossFor(waveNumber);
  if (boss) groups.push(group(boss, 1, 0, BOSS_DELAY, freeplayGrowth));
  return groups;
}

function openingGroups(waveNumber) {
  return OPENING_WAVES[waveNumber - 1].map((entry) => group(entry.type, entry.count, entry.gap, entry.delay, 1));
}

function formulaGroups(waveNumber, rng, freeplayGrowth) {
  const waves = waveNumber - OPENING_WAVES.length;
  const count = Math.min(WAVE_FORMULA.countCap, Math.round(WAVE_FORMULA.countBase * WAVE_FORMULA.countGrowth ** waves));
  const hpMultiplier = WAVE_FORMULA.hpGrowth ** waves * freeplayGrowth;
  const gap = Math.max(WAVE_FORMULA.gapMin, WAVE_FORMULA.gapStart - WAVE_FORMULA.gapShrinkPerWave * waves);
  const armouredChance = modifierChance(waveNumber, MODIFIERS.armoured.fromWave);
  const wardedChance = modifierChance(waveNumber, MODIFIERS.warded.fromWave);

  const pool = REGULAR_TYPES.filter((type) => ENEMIES[type].unlock <= waveNumber);
  const totalWeight = pool.reduce((sum, type) => sum + ENEMIES[type].unlock, 0);
  const counts = new Map(pool.map((type) => [type, 0]));
  for (let i = 0; i < count; i++) {
    // Weight by the wave each enemy first arrives on, so newer enemies fill most of the wave and the old ones thin out.
    let roll = rng.next() * totalWeight;
    const chosen = pool.find((type) => (roll -= ENEMIES[type].unlock) < 0) ?? pool[pool.length - 1];
    counts.set(chosen, counts.get(chosen) + 1);
  }

  const groups = [];
  let delay = 0;
  for (const type of pool) {
    const typeCount = counts.get(type);
    if (typeCount === 0) continue;
    groups.push({ ...group(type, typeCount, gap, delay, hpMultiplier), armouredChance, wardedChance });
    delay += typeCount * gap;
  }
  return groups;
}

function modifierChance(waveNumber, fromWave) {
  if (waveNumber < fromWave) return 0;
  const { modifierChanceStart, modifierChancePerWave, modifierChanceCap } = WAVE_FORMULA;
  return Math.min(modifierChanceCap, modifierChanceStart + modifierChancePerWave * (waveNumber - fromWave));
}

function bossFor(waveNumber) {
  if (BOSS_WAVES[waveNumber]) return BOSS_WAVES[waveNumber];
  if (waveNumber % 10 !== 0) return null;
  return BOSS_COLOURS[(waveNumber / 10 - 1) % BOSS_COLOURS.length];
}

function group(type, count, gap, delay, hpMultiplier) {
  return { type, count, gap, delay, hpMultiplier, armouredChance: 0, wardedChance: 0 };
}
