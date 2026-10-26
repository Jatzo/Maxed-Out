// "Watch it learn": runs the genetic algorithm in a worker, keeps its progress in localStorage and shows it in the panel.
// The page owns the saved copy. The worker never touches storage.
import { GA, TOWERS } from '../core/data.js';
import { CHART_SERIES, drawChart } from './chart.js';
import { el } from './panel.js';

const STORAGE_KEY = 'maxedout.ga.v1';

function readSaved() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    // A save from an older version can name towers or slots that no longer exist, which would stop the replay.
    const validGene = (gene) => gene && Object.hasOwn(TOWERS, gene.type) && Number.isInteger(gene.slot) && gene.slot >= 0 && gene.slot < GA.slotCount;
    const validGenome = (genome) => Array.isArray(genome) && genome.length > 0 && genome.every(validGene);
    if (saved && Array.isArray(saved.population) && saved.population.every(validGenome) && Array.isArray(saved.history)
      && typeof saved.generation === 'number' && (saved.champion == null || validGenome(saved.champion))) return saved;
  } catch {
    // Storage can be blocked or hold something unreadable. Learning then starts fresh and does not persist.
  }
  return null;
}

function writeSaved(saved) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // A full or blocked store only means progress is lost on reload.
  }
}

function clearSaved() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing was saved, so nothing needs clearing.
  }
}

const describeMix = (mix) => Object.entries(mix).map(([type, count]) => `${count} ${TOWERS[type]?.name ?? type}`).join(', ');

/**
 * @param {HTMLElement} root
 * @param {{onChampion: (genome: import('../core/contract.js').Genome | null, isRecord: boolean) => void, onExit: () => void}} handlers
 */
export function createLearn(root, { onChampion, onExit }) {
  const generation = el('p', { class: 'fact', text: 'Generation 1' });
  const evaluating = el('p', { class: 'fact', text: 'Starting' });
  const fill = el('div', { class: 'progress-fill' });
  const bar = el('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Builds tried this generation', 'aria-valuemin': '0' }, fill);
  const canvas = el('canvas', { class: 'chart', width: 400, height: 200, role: 'img' });
  const champion = el('p', { class: 'fact', text: 'No champion yet. The reference build is playing.' });
  const mix = el('p', { class: 'blurb' });
  const status = el('p', { class: 'message', role: 'status' });
  const stopButton = el('button', { class: 'button', type: 'button', text: 'Stop' });
  const resetButton = el('button', { class: 'button', type: 'button', text: 'Reset learning' });
  const exitButton = el('button', { class: 'button', type: 'button', text: 'Back to menu' });
  const legend = el(
    'ul',
    { class: 'legend' },
    ...CHART_SERIES.map(([, label, colour]) => {
      const swatch = el('span', { class: 'swatch', 'aria-hidden': 'true' });
      swatch.style.background = colour;
      return el('li', {}, swatch, label);
    }),
  );

  const panel = el(
    'div',
    { class: 'learn-panel' },
    el('h2', { class: 'panel-heading', text: 'Watch it learn' }),
    el('p', { class: 'blurb', text: `Each generation tries ${GA.populationSize} builds on the same waves. The best are kept and mixed. The faint tiles on the map are the best build so far, replaying at 4x.` }),
    generation,
    evaluating,
    bar,
    canvas,
    legend,
    el('h2', { class: 'panel-heading', text: 'Champion' }),
    champion,
    mix,
    status,
    el('div', { class: 'row' }, stopButton, resetButton),
    exitButton,
  );
  root.append(panel);

  let worker = null;
  let saved = { generation: 0, population: [], history: [], champion: null };

  function showHistory() {
    drawChart(canvas, saved.history);
    const last = saved.history[saved.history.length - 1];
    canvas.setAttribute(
      'aria-label',
      last
        ? `Fitness by generation. After generation ${last.generation}: best ${Math.round(last.best)}, mean ${Math.round(last.mean)}, best so far ${Math.round(last.bestSoFar)}.`
        : 'Fitness by generation. No generations finished yet.',
    );
    if (last) {
      generation.textContent = `Generation ${last.generation + 1}`;
      champion.textContent = `The best build reaches wave ${last.bestWave}.`;
      mix.textContent = describeMix(last.towerMix);
    } else {
      generation.textContent = 'Generation 1';
      champion.textContent = 'No champion yet. The reference build is playing.';
      mix.textContent = '';
    }
  }

  function handleMessage({ data }) {
    if (data.type === 'progress') {
      generation.textContent = `Generation ${data.generation}`;
      evaluating.textContent = `Evaluating ${Math.min(data.index + 1, data.total)} of ${data.total}`;
      bar.setAttribute('aria-valuemax', String(data.total));
      bar.setAttribute('aria-valuenow', String(data.index));
      fill.style.width = `${Math.round((100 * data.index) / data.total)}%`;
    } else if (data.type === 'generation') {
      // Elites are scored again each generation and tie their old score exactly, so only a strictly higher
      // score counts as a record. Otherwise every generation would interrupt the replay.
      const previousBest = saved.history.at(-1)?.bestSoFar ?? -Infinity;
      saved = { generation: data.summary.generation, population: data.population, history: [...saved.history, data.summary], champion: data.champion };
      writeSaved(saved);
      showHistory();
      onChampion(data.champion, data.summary.best > previousBest);
    }
  }

  function launch() {
    worker?.terminate();
    status.textContent = '';
    try {
      worker = new Worker(new URL('../ga-worker.js', import.meta.url), { type: 'module' });
    } catch {
      status.textContent = 'Learning cannot run in this browser. The replay still plays.';
      return;
    }
    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', () => {
      status.textContent = 'Learning stopped unexpectedly. Press Reset learning to try again.';
    });
    const resume = saved.population.length > 0 ? { generation: saved.generation, population: saved.population, history: saved.history } : undefined;
    worker.postMessage({ type: 'start', seed: GA.trainingSeed, resume });
    stopButton.textContent = 'Stop';
  }

  function halt() {
    worker?.terminate();
    worker = null;
    stopButton.textContent = 'Keep learning';
    evaluating.textContent = 'Stopped';
  }

  stopButton.addEventListener('click', () => (worker ? halt() : launch()));
  resetButton.addEventListener('click', () => {
    halt();
    clearSaved();
    saved = { generation: 0, population: [], history: [], champion: null };
    showHistory();
    onChampion(null, true);
    launch();
  });
  exitButton.addEventListener('click', () => {
    halt();
    onExit();
  });

  return {
    /** Picks up saved progress, replays its champion, and starts the worker. */
    begin() {
      saved = readSaved() || saved;
      showHistory();
      onChampion(saved.champion || null, true);
      launch();
    },
    halt,
  };
}
