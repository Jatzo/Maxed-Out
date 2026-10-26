import test from 'node:test';
import assert from 'node:assert/strict';
import { GA, RULES, TOWER_ORDER } from '../src/core/data.js';
import { createRng } from '../src/core/rng.js';
import { evaluate, nextGeneration, randomGenome } from '../src/core/ga.js';
import { REFERENCE_GENOME } from '../src/core/policy.js';

function assertValidGenome(genome) {
  assert.equal(genome.length, GA.genomeLength);
  for (const entry of genome) {
    assert.deepEqual(Object.keys(entry).sort(), ['slot', 'type']);
    assert.ok(TOWER_ORDER.includes(entry.type), `type ${entry.type}`);
    assert.ok(Number.isInteger(entry.slot) && entry.slot >= 0 && entry.slot < GA.slotCount, `slot ${entry.slot}`);
  }
}

const randomPopulation = (rng) => Array.from({ length: GA.populationSize }, () => randomGenome(rng));

test('a random genome is valid and the same seed gives the same genome', () => {
  assertValidGenome(randomGenome(createRng(1)));
  assert.deepEqual(randomGenome(createRng(5)), randomGenome(createRng(5)));
  assert.notDeepEqual(randomGenome(createRng(5)), randomGenome(createRng(6)));
});

test('every genome from breeding is valid, over many generations and with heavy mutation', () => {
  const rng = createRng(2);
  let population = randomPopulation(rng);
  for (let generation = 0; generation < 60; generation++) {
    const fitnesses = population.map(() => rng.next() * 10000);
    population = nextGeneration(population, fitnesses, rng);
    assert.equal(population.length, GA.populationSize);
    population.forEach(assertValidGenome);
  }
});

test('breeding keeps the elites unchanged and does not alter the parents', () => {
  const rng = createRng(3);
  const population = randomPopulation(rng);
  const snapshot = structuredClone(population);
  const fitnesses = population.map((_, index) => index);
  const next = nextGeneration(population, fitnesses, rng);
  assert.deepEqual(population, snapshot);
  assert.deepEqual(next[0], population[GA.populationSize - 1]);
  assert.deepEqual(next[1], population[GA.populationSize - 2]);
  assert.notEqual(next[0], population[GA.populationSize - 1]);
});

test('the next generation differs from the last, so the search moves', () => {
  const rng = createRng(4);
  const population = randomPopulation(rng);
  const next = nextGeneration(population, population.map(() => rng.next()), rng);
  assert.notDeepEqual(next.slice(GA.elites), population.slice(GA.elites));
});

test('the same seed and genome give identical results', () => {
  const first = evaluate(REFERENCE_GENOME, 3, 12);
  const second = evaluate(REFERENCE_GENOME, 3, 12);
  assert.deepEqual(first, second);
});

test('an evaluation stops at the wave limit and reports waves cleared, lives and what was built', () => {
  const result = evaluate(REFERENCE_GENOME, 1, 4);
  assert.equal(result.wave, 4);
  assert.ok(result.lives > 0 && result.lives <= RULES.startLives);
  assert.ok(result.fitness >= 4000 + result.lives * 10);
  assert.ok(result.fitness < 4000 + result.lives * 10 + 10);
  const built = Object.values(result.towerMix).reduce((total, count) => total + count, 0);
  assert.ok(built > 0);
  for (const type of Object.keys(result.towerMix)) assert.ok(TOWER_ORDER.includes(type));
});

test('a genome that builds nothing loses early and scores by the waves it survived', () => {
  const idle = [{ type: 'maxMage', slot: 0 }];
  const result = evaluate(idle, 1);
  assert.ok(result.wave < 10);
  assert.equal(result.lives, 0);
  assert.equal(Math.floor(result.fitness / 1000), result.wave);
});
