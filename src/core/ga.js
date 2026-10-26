import { GA, RULES, TOWER_ORDER } from './data.js';
import { createPolicy } from './policy.js';
import { createGame } from './sim.js';

const copyGene = (gene) => ({ type: gene.type, slot: gene.slot });

export function randomGenome(rng) {
  return Array.from({ length: GA.genomeLength }, () => ({ type: rng.pick(TOWER_ORDER), slot: rng.int(GA.slotCount) }));
}

/**
 * Plays a genome from the first wave until it loses or clears `maxWave`. `wave` is the number of waves cleared.
 * Fitness is waves cleared first, lives second, and the seconds survived as a tie-break so that of two genomes
 * that fall on the same wave, the one that held out longer ranks higher.
 */
export function evaluate(genome, seed, maxWave = RULES.winWave) {
  const game = createGame(seed, { recordEvents: false });
  const policy = createPolicy(genome);
  while (game.wave < maxWave && game.phase !== 'lost') {
    policy.act(game);
    game.startWave();
    while (game.phase === 'wave') game.step(RULES.step);
  }
  const wave = game.phase === 'lost' ? game.wave - 1 : game.wave;
  const towerMix = {};
  for (const tower of game.towers) towerMix[tower.type] = (towerMix[tower.type] ?? 0) + 1;
  return { fitness: wave * 1000 + game.lives * 10 + game.time / 1000, wave, lives: game.lives, towerMix };
}

/**
 * Breeds the next population: the best genomes carry over untouched, the rest come from tournament selection,
 * one-point crossover and per-gene mutation. The input is never altered.
 */
export function nextGeneration(population, fitnesses, rng) {
  const ranked = population.map((_, index) => index).sort((a, b) => fitnesses[b] - fitnesses[a]);
  const next = ranked.slice(0, GA.elites).map((index) => population[index].map(copyGene));

  function tournament() {
    let winner = rng.int(population.length);
    for (let i = 1; i < GA.tournamentSize; i++) {
      const rival = rng.int(population.length);
      if (fitnesses[rival] > fitnesses[winner]) winner = rival;
    }
    return population[winner];
  }

  while (next.length < population.length) {
    next.push(mutate(crossover(tournament(), tournament(), rng), rng));
  }
  return next;
}

function crossover(first, second, rng) {
  const cut = 1 + rng.int(first.length - 1);
  return [...first.slice(0, cut), ...second.slice(cut)].map(copyGene);
}

function mutate(genome, rng) {
  for (let index = 0; index < genome.length; index++) {
    if (rng.next() >= GA.mutationRate) continue;
    const gene = genome[index];
    const choice = rng.int(3);
    if (choice === 0) {
      gene.type = rng.pick(TOWER_ORDER);
    } else if (choice === 1) {
      const moved = gene.slot + rng.int(2 * GA.slotNudge + 1) - GA.slotNudge;
      gene.slot = Math.min(GA.slotCount - 1, Math.max(0, moved));
    } else {
      const other = rng.int(genome.length);
      [genome[index], genome[other]] = [genome[other], genome[index]];
    }
  }
  return genome;
}
