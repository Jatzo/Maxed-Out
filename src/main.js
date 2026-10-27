// The page: owns the frame loop, input, and the modes (play, watch it learn, demo, fixture and sprite sheet).
import { RULES, GA, MAP, TILE, TOWERS, TOWER_ORDER } from './core/data.js';
import { createRenderer, WIDTH, HEIGHT } from './render/renderer.js';
import { createEffects } from './ui/effects.js';
import { createPanel } from './ui/panel.js';
import { createLearn } from './ui/learn.js';
import { showTitle, showWin, showLoss, hideOverlay } from './ui/overlays.js';
import { drawSheet } from './ui/sheet.js';

const MAX_STEPS_PER_FRAME = 12;
const PAUSE_BETWEEN_WAVES = 0.6;
const RESTART_DELAY = 2;
// A replay is only cut short by a new record once it has had this long, so the player sees some of it.
const MIN_REPLAY_SECONDS = 60;
const FAST_FORWARD_STEP_LIMIT = 600000;
const STILL_MESSAGE = 'This is a still picture of a game in progress, so nothing here can be changed.';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('game');
const panelRoot = document.getElementById('panel');
const renderer = createRenderer(canvas);
const effects = createEffects();

// The map and an empty army, drawn behind the title screen before any game exists.
const idleState = () => ({
  gold: RULES.startGold, lives: RULES.startLives, wave: 0, phase: 'build',
  map: { terrain: MAP.terrain }, towers: [], enemies: [], projectiles: [],
});

const run = {
  game: idleState(),
  /** 'idle' draws only; 'play' is the player; 'auto' is a policy playing; 'still' draws a frozen state. */
  driver: 'idle',
  policy: null,
  speed: 1,
  accumulator: 0,
  freeplay: false,
  ended: false,
  pause: PAUSE_BETWEEN_WAVES,
  restartIn: 0,
  stopAfterWave: null,
  frozenEffects: false,
  age: 0,
};

const ui = { placing: null, selectedId: null, pointer: null, ghosts: [] };

let simModules = null;
function loadSim() {
  simModules ??= Promise.all([import('./core/sim.js'), import('./core/policy.js')]).catch((error) => {
    simModules = null;
    throw error;
  });
  return simModules;
}

const setMode = (mode) => { document.body.dataset.mode = mode; };

function resetRun() {
  Object.assign(run, {
    game: idleState(), driver: 'idle', policy: null, speed: 1, accumulator: 0, freeplay: false, ended: false,
    pause: PAUSE_BETWEEN_WAVES, restartIn: 0, stopAfterWave: null, frozenEffects: false, age: 0,
  });
  Object.assign(ui, { placing: null, selectedId: null, pointer: null, ghosts: [] });
}

// ---------------------------------------------------------------------------------------------
// Panel actions
// ---------------------------------------------------------------------------------------------

const interactive = () => run.driver === 'play';
const canStart = () => interactive() && (run.game.phase === 'build' || (run.game.phase === 'won' && run.freeplay));
const selectedTower = () => run.game.towers.find((tower) => tower.id === ui.selectedId) || null;

function refuse() {
  if (run.driver === 'still') panel.say(STILL_MESSAGE);
  return !interactive();
}

const sentence = (reason) => `${reason}.`;

const actions = {
  pick(type) {
    if (refuse()) return;
    const { cost, name } = TOWERS[type];
    if (ui.placing === type) {
      ui.placing = null;
      panel.say('');
    } else if (run.game.gold < cost) {
      panel.say(`A ${name} costs ${cost} gold and you have ${Math.floor(run.game.gold)}.`);
    } else {
      ui.placing = type;
      ui.selectedId = null;
      panel.say('Choose a free grass tile. Escape cancels.');
    }
  },
  startWave() {
    if (refuse()) return;
    if (!canStart()) panel.say('A wave is already under way.');
    else {
      run.game.startWave();
      panel.say('');
    }
  },
  setSpeed(speed) {
    if (refuse()) return;
    run.speed = speed;
  },
  upgrade() {
    if (refuse()) return;
    const result = run.game.upgrade(ui.selectedId);
    panel.say(result.ok ? 'Upgraded.' : sentence(result.reason));
  },
  sell() {
    if (refuse()) return;
    const result = run.game.sell(ui.selectedId);
    ui.selectedId = null;
    if (result.ok) panel.say(`Sold for ${result.refund} gold.`);
  },
  setTargeting(targeting) {
    if (refuse()) return;
    run.game.setTargeting(ui.selectedId, targeting);
  },
};

const panel = createPanel(panelRoot, actions);

// ---------------------------------------------------------------------------------------------
// Starting and ending games
// ---------------------------------------------------------------------------------------------

function showMenu(notice) {
  learn.halt();
  resetRun();
  setMode('menu');
  showTitle({ onPlay: startPlay, onLearn: startLearn, notice });
}

const loadFailed = () => showMenu('The game engine did not load. Reload the page and try again.');

async function startPlay() {
  hideOverlay();
  try {
    const [{ createGame }] = await loadSim();
    resetRun();
    run.game = createGame(Math.floor(Math.random() * 1e9));
    run.driver = 'play';
    setMode('play');
    panel.say('');
  } catch {
    loadFailed();
  }
}

function fastForward(game, policy, untilWave) {
  for (let i = 0; i < FAST_FORWARD_STEP_LIMIT && (game.phase === 'build' || game.phase === 'wave'); i++) {
    if (game.phase === 'build') {
      if (game.wave >= untilWave) break;
      policy.act(game);
      game.startWave();
    }
    game.step(RULES.step);
    game.drainEvents();
  }
}

// The first gene for each slot is the tower placed there. Later genes upgrade it, so they add no new tile.
function plannedTiles(genome, game) {
  const seen = new Set();
  const tiles = [];
  for (const gene of genome) {
    const slot = game.map.slots[gene.slot];
    if (!slot || seen.has(gene.slot)) continue;
    seen.add(gene.slot);
    tiles.push({ type: gene.type, col: slot.col, row: slot.row });
  }
  return tiles;
}

/**
 * Plays a genome on the training seed and keeps replaying it. `fastForwardTo` skips ahead without drawing.
 * @param {{genome?: import('./core/contract.js').Genome | null, speed: number, fastForwardTo?: number, stopAfterWave?: number, showPlan?: boolean}} options
 */
async function startAuto({ genome, speed, fastForwardTo = 0, stopAfterWave = null, showPlan = true }) {
  const [{ createGame }, { createPolicy, REFERENCE_GENOME }] = await loadSim();
  const chosen = genome || REFERENCE_GENOME;
  const game = createGame(GA.trainingSeed);
  const policy = createPolicy(chosen);
  if (fastForwardTo) fastForward(game, policy, fastForwardTo);
  resetRun();
  Object.assign(run, { game, policy, driver: 'auto', speed, stopAfterWave });
  ui.ghosts = showPlan ? plannedTiles(chosen, game) : [];
}

function startLearn() {
  hideOverlay();
  setMode('learn');
  learn.begin();
}

// The mode changes only once the fast-forward is done, so a recording can wait for it.
function startDemo() {
  startAuto({ speed: 4, fastForwardTo: 19, stopAfterWave: 20, showPlan: false })
    .then(() => setMode('demo'))
    .catch(loadFailed);
}

// The learner's newest champion. A replay carries on to its end unless a new record arrives after it has played a while.
let champion = null;
let recordWaiting = false;

function replayChampion() {
  recordWaiting = false;
  startAuto({ genome: champion, speed: 4 }).catch(loadFailed);
}

const learn = createLearn(panelRoot, {
  onChampion(genome, isRecord) {
    champion = genome;
    if (run.driver !== 'auto' || genome === null) replayChampion();
    else if (isRecord) recordWaiting = true;
  },
  onExit: () => showMenu(),
});

function keepGoing() {
  run.freeplay = true;
  run.ended = false;
  hideOverlay();
  panel.say('The waves keep coming. Start the next one when you are ready.');
}

function checkEnd() {
  const { game } = run;
  const finished = game.phase === 'lost' || (game.phase === 'won' && !run.freeplay);
  if (run.ended || !finished) return;
  run.ended = true;
  if (run.driver === 'auto') {
    if (run.stopAfterWave === null) run.restartIn = RESTART_DELAY;
  } else if (game.phase === 'won') {
    showWin({ lives: game.lives, onAgain: startPlay, onKeepGoing: keepGoing });
  } else {
    showLoss({ wave: game.wave, onAgain: startPlay });
  }
}

// ---------------------------------------------------------------------------------------------
// The frame loop
// ---------------------------------------------------------------------------------------------

function autopilot(dt) {
  const { game } = run;
  run.age += dt;
  if (run.restartIn > 0) {
    run.restartIn -= dt;
    if (run.restartIn <= 0) replayChampion();
    return;
  }
  if (recordWaiting && run.age >= MIN_REPLAY_SECONDS) {
    replayChampion();
    return;
  }
  if (game.phase !== 'build') return;
  if (run.stopAfterWave !== null && game.wave >= run.stopAfterWave) {
    run.driver = 'still';
    return;
  }
  run.pause -= dt;
  if (run.pause <= 0) {
    run.policy.act(game);
    game.startWave();
    run.pause = PAUSE_BETWEEN_WAVES;
  }
}

function advance(dt) {
  const { game } = run;
  if (run.driver === 'auto') autopilot(dt);
  if (run.driver !== 'play' && run.driver !== 'auto') return;
  if (game.phase === 'wave') {
    run.accumulator += dt * run.speed;
    let steps = 0;
    while (run.accumulator >= RULES.step && steps < MAX_STEPS_PER_FRAME) {
      game.step(RULES.step);
      run.accumulator -= RULES.step;
      steps += 1;
    }
    if (steps === MAX_STEPS_PER_FRAME) run.accumulator = 0;
  }
  const events = game.drainEvents();
  effects.handle(events, game);
  if (run.driver === 'play') {
    const ended = events.find((event) => event.type === 'waveEnd');
    if (ended) panel.say(`Wave ${ended.amount} cleared. Spend your gold, then start the next one.`);
  }
  checkEnd();
}

let lastFrame = performance.now();

function frame(now) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  advance(dt);
  if (!run.frozenEffects) effects.update(dt);

  const { game } = run;
  const placing = ui.placing && ui.pointer && interactive()
    ? { type: ui.placing, col: ui.pointer.col, row: ui.pointer.row, valid: game.canPlace(ui.placing, ui.pointer.col, ui.pointer.row) }
    : null;
  renderer.draw({
    state: game,
    alpha: game.phase === 'wave' && run.driver !== 'still' ? run.accumulator / RULES.step : 1,
    time: now / 1000,
    hover: placing,
    selectedId: ui.selectedId,
    ghosts: ui.ghosts,
    effects,
  });
  panel.sync(game, { placing: ui.placing, selectedId: ui.selectedId, speed: run.speed, canStart: canStart() });
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------------------------

function tileAt(event) {
  const box = canvas.getBoundingClientRect();
  const col = Math.floor(((event.clientX - box.left) * WIDTH) / box.width / TILE);
  const row = Math.floor(((event.clientY - box.top) * HEIGHT) / box.height / TILE);
  return col >= 0 && row >= 0 && col < MAP.terrain[0].length && row < MAP.terrain.length ? { col, row } : null;
}

canvas.addEventListener('pointermove', (event) => { ui.pointer = tileAt(event); });
canvas.addEventListener('pointerleave', () => { ui.pointer = null; });
canvas.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  ui.placing = null;
});
canvas.addEventListener('click', (event) => {
  const tile = tileAt(event);
  if (!tile) return;
  if (run.driver === 'still') {
    panel.say(STILL_MESSAGE);
    return;
  }
  if (!interactive()) return;
  if (ui.placing) {
    const result = run.game.place(ui.placing, tile.col, tile.row);
    if (result.ok) {
      panel.say(`${TOWERS[ui.placing].name} placed.`);
      ui.placing = null;
    } else {
      panel.say(sentence(result.reason));
    }
    return;
  }
  const tower = run.game.towers.find((candidate) => candidate.col === tile.col && candidate.row === tile.row);
  ui.selectedId = tower ? tower.id : null;
});

window.addEventListener('keydown', (event) => {
  if (!document.getElementById('overlay').hidden || event.ctrlKey || event.metaKey || event.altKey) return;
  const onControl = event.target instanceof HTMLButtonElement || event.target instanceof HTMLSelectElement;
  if (event.key === 'Escape') {
    ui.placing = null;
    ui.selectedId = null;
    panel.say('');
  } else if (/^[0-9]$/.test(event.key)) {
    // Keys 1 to 9 pick the first nine towers and 0 picks the tenth, as on the number row.
    actions.pick(TOWER_ORDER[(Number(event.key) + 9) % 10]);
  } else if (event.key === ' ' && !onControl) {
    event.preventDefault();
    actions.startWave();
  }
});

// ---------------------------------------------------------------------------------------------
// Modes chosen by the address
// ---------------------------------------------------------------------------------------------

async function startFixture() {
  setMode('play');
  const { midWaveState } = await import('../tests/fixtures/state-midwave.mjs');
  resetRun();
  run.game = midWaveState;
  run.driver = 'still';
  run.frozenEffects = true;
  ui.selectedId = 3;
  effects.handle(midWaveState.events, midWaveState);
  effects.age(0.3);
}

if (params.has('sheet')) {
  setMode('sheet');
  drawSheet(canvas);
} else {
  requestAnimationFrame(frame);
  if (params.has('fixture')) startFixture();
  else if (params.has('demo')) startDemo();
  else if (params.has('auto')) startLearn();
  else showMenu();
}
