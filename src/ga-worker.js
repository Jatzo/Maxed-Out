// Module worker for the genetic algorithm. The page owns saving; this file never touches localStorage.
// Messages are described in src/core/contract.js. The population sent with each 'generation' message is the
// next one to evaluate, so a saved copy can be sent back as `resume` and carry on without repeating work.
import { GA } from './core/data.js';
import { evaluate, nextGeneration, randomGenome } from './core/ga.js';
import { createRng } from './core/rng.js';

// Each start or stop bumps the counter, which tells a running loop that it has been replaced or stopped.
let currentRun = 0;

// A synchronous loop would never see a 'stop' message, so the loop hands control back after every evaluation.
const letMessagesThrough = () => new Promise((resolve) => setTimeout(resolve, 0));

self.onmessage = (event) => {
  const message = event.data;
  if (message.type === 'start') run(message);
  else if (message.type === 'stop') currentRun += 1;
};

async function run({ seed, resume }) {
  const thisRun = ++currentRun;
  // The random stream is not saved with a population, so a resumed run starts a fresh one that is still repeatable.
  const rng = createRng(resume ? seed + resume.generation : seed);
  let population = resume ? resume.population : Array.from({ length: GA.populationSize }, () => randomGenome(rng));
  let generation = resume ? resume.generation + 1 : 1;
  let bestSoFar = resume?.history.at(-1)?.bestSoFar ?? 0;

  while (thisRun === currentRun) {
    const results = [];
    for (let index = 0; index < population.length; index++) {
      results.push(evaluate(population[index], GA.trainingSeed));
      self.postMessage({ type: 'progress', generation, index: index + 1, total: population.length });
      await letMessagesThrough();
      if (thisRun !== currentRun) return;
    }

    const fitnesses = results.map((result) => result.fitness);
    const bestIndex = fitnesses.indexOf(Math.max(...fitnesses));
    bestSoFar = Math.max(bestSoFar, fitnesses[bestIndex]);
    const summary = {
      generation,
      best: fitnesses[bestIndex],
      mean: fitnesses.reduce((total, fitness) => total + fitness, 0) / fitnesses.length,
      bestSoFar,
      bestWave: results[bestIndex].wave,
      towerMix: results[bestIndex].towerMix,
    };
    const champion = population[bestIndex];
    population = nextGeneration(population, fitnesses, rng);
    self.postMessage({ type: 'generation', summary, population, champion });
    generation += 1;
  }
}
