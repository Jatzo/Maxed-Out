import test from 'node:test';
import assert from 'node:assert/strict';
import { GA, TOWER_ORDER } from '../src/core/data.js';

// The worker file talks to a global `self`, as a browser worker does, so the test supplies one.
const sent = [];
let waiting = null;
globalThis.self = {
  postMessage(message) {
    sent.push(message);
    if (waiting && waiting.until(message)) waiting.resolve();
  },
};
await import('../src/ga-worker.js');

function untilMessage(until) {
  return new Promise((resolve) => {
    waiting = { until, resolve };
  });
}

test('the worker reports progress, then a generation with a valid population and champion, and stops when told', async () => {
  const finished = untilMessage((message) => message.type === 'generation');
  self.onmessage({ data: { type: 'start', seed: 7 } });
  await finished;
  self.onmessage({ data: { type: 'stop' } });

  const progress = sent.filter((message) => message.type === 'progress' && message.generation === 1);
  assert.equal(progress.length, GA.populationSize);
  assert.deepEqual(progress[0], { type: 'progress', generation: 1, index: 1, total: GA.populationSize });
  assert.equal(progress.at(-1).index, GA.populationSize);

  const generation = sent.find((message) => message.type === 'generation');
  assert.equal(generation.summary.generation, 1);
  assert.deepEqual(Object.keys(generation.summary).sort(),
    ['best', 'bestSoFar', 'bestWave', 'generation', 'mean', 'towerMix']);
  assert.ok(generation.summary.best >= generation.summary.mean);
  assert.equal(generation.summary.bestSoFar, generation.summary.best);
  assert.equal(generation.population.length, GA.populationSize);
  assert.equal(generation.champion.length, GA.genomeLength);
  for (const gene of [...generation.champion, ...generation.population.flat()]) {
    assert.ok(TOWER_ORDER.includes(gene.type));
    assert.ok(gene.slot >= 0 && gene.slot < GA.slotCount);
  }

  const countAtStop = sent.length;
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(sent.length <= countAtStop + 1, 'the worker kept going after stop');
});

test('a resumed run carries on from the saved generation with the saved population', async () => {
  sent.length = 0;
  const population = Array.from({ length: GA.populationSize }, () => (
    Array.from({ length: GA.genomeLength }, () => ({ type: 'pure', slot: 0 }))));
  const history = [{ generation: 5, best: 5000, mean: 3000, bestSoFar: 5123, bestWave: 5, towerMix: {} }];
  const finished = untilMessage((message) => message.type === 'generation');
  self.onmessage({ data: { type: 'start', seed: 7, resume: { generation: 5, population, history } } });
  await finished;
  self.onmessage({ data: { type: 'stop' } });

  const generation = sent.find((message) => message.type === 'generation');
  assert.equal(generation.summary.generation, 6);
  assert.ok(generation.summary.bestSoFar >= 5123);
  assert.deepEqual(generation.champion, population[0]);
});
