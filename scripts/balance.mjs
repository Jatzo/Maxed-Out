// Headless balance check. Plays fixed strategies against the real simulation, prints a table, and exits 1 if
// any target is missed. Add --ga to run the slow genetic algorithm target as well.
import { performance } from 'node:perf_hooks';
import { ENEMIES, GA, RULES } from '../src/core/data.js';
import { evaluate, nextGeneration, randomGenome } from '../src/core/ga.js';
import { REFERENCE_GENOME, createPolicy } from '../src/core/policy.js';
import { createRng } from '../src/core/rng.js';
import { createGame } from '../src/core/sim.js';

const SEEDS = [1, 2, 3, 4, 5];
const GA_GENERATIONS = 15;
const GA_REQUIRED_GAIN = 15;
const GA_SEEDS = [1, 2, 3];

// Buys the same tower on the best free slots until gold runs out, and never upgrades anything.
function buyOnly(type) {
  return {
    act(game) {
      for (const slot of game.map.slots) {
        if (game.towers.some((tower) => tower.col === slot.col && tower.row === slot.row)) continue;
        if (!game.place(type, slot.col, slot.row).ok) return;
      }
    },
  };
}

const genomeOf = (type, count) => Array.from({ length: count }, (_, slot) => ({ type, slot }));

const STRATEGIES = {
  nothing: () => ({ act() {} }),
  'pure, no upgrades': () => buyOnly('pure'),
  'pure, upgraded': () => createPolicy(genomeOf('pure', 30)),
  'mage only': () => createPolicy(genomeOf('mage', 30)),
  'bomber only': () => createPolicy(genomeOf('bomber', 30)),
  reference: () => createPolicy(REFERENCE_GENOME),
  'farmer heavy': () => createPolicy([
    ...genomeOf('flipper', 10),
    ...genomeOf('pure', 10).map((gene) => ({ ...gene, slot: gene.slot + 10 })),
  ]),
};

/** Plays one game. Waves cleared counts waves fully beaten; bossDeaths records how far along the path each boss got. */
function play(policy, seed, watchBosses = false) {
  const game = createGame(seed, { recordEvents: watchBosses });
  const lastProgress = new Map();
  const bossDeaths = [];
  while (game.wave < RULES.winWave && game.phase !== 'lost') {
    policy.act(game);
    game.startWave();
    while (game.phase === 'wave') {
      game.step(RULES.step);
      if (!watchBosses) continue;
      for (const enemy of game.enemies) if (ENEMIES[enemy.type].boss) lastProgress.set(enemy.id, enemy.progress);
      for (const event of game.drainEvents()) {
        if (event.type === 'kill' && lastProgress.has(event.enemyId)) {
          bossDeaths.push({ wave: game.wave, share: lastProgress.get(event.enemyId) / game.map.pathLength });
        }
      }
    }
  }
  const lost = game.phase === 'lost';
  return { lost, wave: game.wave, cleared: lost ? game.wave - 1 : game.wave, lives: game.lives, bossDeaths };
}

const results = {};
for (const [name, make] of Object.entries(STRATEGIES)) {
  results[name] = SEEDS.map((seed) => play(make(), seed, name === 'reference'));
}

const failures = [];
function target(label, passed, detail) {
  console.log(`${passed ? 'pass' : 'FAIL'}  ${label}  ${detail}`);
  if (!passed) failures.push(label);
}

console.log('strategy             seeds 1 to 5: wave lost on (or won)   lives left');
for (const [name, runs] of Object.entries(results)) {
  const waves = runs.map((run) => (run.lost ? String(run.wave) : 'won')).join(' ');
  console.log(`${name.padEnd(20)} ${waves.padEnd(36)}${runs.map((run) => run.lives).join(' ')}`);
}

console.log('');
const lostWaves = (name) => results[name].map((run) => (run.lost ? run.wave : Infinity));
const worst = (values) => Math.max(...values);

target('1a nothing loses by wave 6', worst(lostWaves('nothing')) <= 6, `latest loss wave ${worst(lostWaves('nothing'))}`);
target('1b pure without upgrades dies before wave 12', worst(lostWaves('pure, no upgrades')) < 12,
  `latest loss wave ${worst(lostWaves('pure, no upgrades'))}`);
target('2a reference clears wave 40 on seeds 1 to 5', results.reference.every((run) => !run.lost),
  `lost on ${lostWaves('reference').join(' ')}`);

const bossDeaths = results.reference.flatMap((run) => run.bossDeaths);
const furthest = Math.max(0, ...bossDeaths.map((death) => death.share));
for (const wave of [10, 20, 30, 40]) {
  const shares = bossDeaths.filter((death) => death.wave === wave).map((death) => `${(death.share * 100).toFixed(0)}%`);
  console.log(`      boss on wave ${wave} died at ${shares.join(' ') || 'never'} of the path`);
}
// Where a boss dies depends mostly on where the reference stands its ranged towers (the loop that starts about
// 70% along the path), so the target is that every boss dies, with the death point printed for tuning.
target('2b every boss is killed on every seed', bossDeaths.length === 4 * SEEDS.length && furthest < 1,
  `furthest ${(furthest * 100).toFixed(0)}%, ${bossDeaths.length} of ${4 * SEEDS.length} bosses killed`);
target('3a mage only fails before wave 30', worst(lostWaves('mage only')) < 30, `latest loss wave ${worst(lostWaves('mage only'))}`);
target('3b pure with upgrades fails before wave 30', worst(lostWaves('pure, upgraded')) < 30,
  `latest loss wave ${worst(lostWaves('pure, upgraded'))}`);
target('3c farmer heavy fails before wave 30', worst(lostWaves('farmer heavy')) < 30,
  `latest loss wave ${worst(lostWaves('farmer heavy'))}`);
target('3d bomber only fails before wave 30', worst(lostWaves('bomber only')) < 30,
  `latest loss wave ${worst(lostWaves('bomber only'))}`);

const timings = [];
for (let i = 0; i < 3; i++) {
  const started = performance.now();
  evaluate(REFERENCE_GENOME, 1);
  timings.push(performance.now() - started);
}
console.log(`\nfull 40-wave evaluation: ${Math.min(...timings).toFixed(0)} ms (best of 3)`);

if (process.argv.includes('--ga')) {
  // The whole population is measured, not just the champion: one lucky random genome can already reach the
  // late waves in generation 1, which would hide whether the population as a whole is learning.
  const medianOf = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const gains = [];
  for (const seed of GA_SEEDS) {
    const rng = createRng(seed);
    let population = Array.from({ length: GA.populationSize }, () => randomGenome(rng));
    const champions = [];
    const medians = [];
    for (let generation = 1; generation <= GA_GENERATIONS; generation++) {
      const scored = population.map((genome) => evaluate(genome, GA.trainingSeed));
      champions.push(Math.max(...scored.map((result) => result.wave)));
      medians.push(medianOf(scored.map((result) => result.wave)));
      population = nextGeneration(population, scored.map((result) => result.fitness), rng);
    }
    gains.push(medians[GA_GENERATIONS - 1] - medians[0]);
    console.log(`seed ${seed}: champion wave by generation ${champions.join(' ')}`);
    console.log(`        median wave by generation   ${medians.join(' ')}`);
  }
  const median = medianOf(gains);
  target(`4 the population's median wave gains at least ${GA_REQUIRED_GAIN} in ${GA_GENERATIONS} generations`,
    median >= GA_REQUIRED_GAIN, `gains ${gains.join(' ')}, median ${median}`);
}

if (failures.length > 0) {
  console.error(`\n${failures.length} target${failures.length === 1 ? '' : 's'} missed.`);
  process.exit(1);
}
console.log('\nAll targets met.');
