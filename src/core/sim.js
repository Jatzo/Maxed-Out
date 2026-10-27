import { ENEMIES, RULES, TILE, TOWERS } from './data.js';
import { buildMap, buildPathTable, isBuildable } from './map.js';
import { createRng } from './rng.js';
import { buildWave } from './waves.js';

const PROJECTILE_SPEED = 14 * TILE;
// Path samples are 4 px apart. A tower's windows are widened by one sample each side so the exact distance test
// afterwards is the only thing that decides whether an enemy is in range.
const WINDOW_SAMPLE = 4;
const CLEAVE_RADIUS = 0.75 * TILE;
const PIERCE_REACH = 2 * TILE;
const PIERCE_HALF_WIDTH = TILE / 2;
const BASIC_SPELLS = ['spell-air', 'spell-water', 'spell-earth', 'spell-fire'];

const TERRAIN_REFUSALS = {
  '#': 'Cannot build on the path',
  '=': 'Cannot build on the path',
  '~': 'Cannot build on water',
  T: 'A tree is in the way',
  R: 'A rock is in the way',
  C: 'Cannot build on the castle',
};

// The map never changes, and ranking its slots is the slowest part of starting a game, so every game shares one.
const sharedMap = buildMap();
const sharedTable = buildPathTable(sharedMap);

const damageTypeOf = (tower) => TOWERS[tower.type].damageType;
const statsOf = (tower) => TOWERS[tower.type].tiers[tower.tier].stats;
const isBoss = (enemy) => ENEMIES[enemy.type].boss === true;

/**
 * Creates a game. Set `recordEvents` to false for headless runs that never call drainEvents, so the queue cannot
 * grow without end.
 * @returns {import('./contract.js').Game}
 */
export function createGame(seed, { recordEvents = true } = {}) {
  const rng = createRng(seed);
  const map = sharedMap;
  const table = sharedTable;

  // Working data that is not part of the shared state shapes lives beside the objects, not on them.
  const towerWork = new WeakMap();
  const enemyWork = new WeakMap();
  const projectileWork = new WeakMap();

  let events = [];
  let nextId = 1;
  let stepCount = 0;
  let waveClock = 0;
  let spawns = [];
  let spawnIndex = 0;
  const byProgress = [];
  const candidates = [];

  function emit(type, x, y, fields) {
    if (recordEvents) events.push({ type, x, y, ...fields });
  }

  // Placement and selling

  function refusalFor(type, col, row) {
    const definition = TOWERS[type];
    if (!definition) return 'There is no such tower';
    if (col < 0 || row < 0 || col >= map.cols || row >= map.rows) return 'That is off the map';
    if (!isBuildable(map, col, row)) return TERRAIN_REFUSALS[map.terrain[row][col]] ?? 'Cannot build there';
    if (game.towers.some((tower) => tower.col === col && tower.row === row)) return 'Something is already built there';
    if (game.gold < definition.cost) return 'Not enough gold';
    return null;
  }

  function canPlace(type, col, row) {
    return refusalFor(type, col, row) === null;
  }

  function place(type, col, row) {
    const reason = refusalFor(type, col, row);
    if (reason) return { ok: false, reason };
    const cost = TOWERS[type].cost;
    game.gold -= cost;
    const tower = {
      id: nextId++, type, tier: 0, col, row, x: col * TILE + TILE / 2, y: row * TILE + TILE / 2,
      angle: 0, attackAnim: 1, targetId: null, targeting: 'first', spent: cost,
    };
    towerWork.set(tower, { cooldown: 0, attacks: 0, spells: 0, windows: [] });
    refreshWindows(tower);
    game.towers.push(tower);
    emit('place', tower.x, tower.y, { amount: cost, towerId: tower.id });
    return { ok: true };
  }

  function upgrade(towerId) {
    const tower = game.towers.find((candidate) => candidate.id === towerId);
    if (!tower) return { ok: false, reason: 'There is no such tower' };
    const next = TOWERS[tower.type].tiers[tower.tier + 1];
    if (!next) return { ok: false, reason: 'Already fully upgraded' };
    if (game.gold < next.cost) return { ok: false, reason: 'Not enough gold' };
    game.gold -= next.cost;
    tower.tier += 1;
    tower.spent += next.cost;
    refreshWindows(tower);
    emit('upgrade', tower.x, tower.y, { amount: next.cost, towerId: tower.id });
    return { ok: true };
  }

  function sell(towerId) {
    const index = game.towers.findIndex((candidate) => candidate.id === towerId);
    if (index < 0) return { ok: false };
    const [tower] = game.towers.splice(index, 1);
    const refund = Math.floor(tower.spent * RULES.sellRefund);
    game.gold += refund;
    emit('sell', tower.x, tower.y, { amount: refund, towerId: tower.id });
    return { ok: true, refund };
  }

  function setTargeting(towerId, targeting) {
    const tower = game.towers.find((candidate) => candidate.id === towerId);
    if (tower) tower.targeting = targeting;
  }

  // Targeting: each tower knows which stretches of path lie inside its range, and enemies are kept sorted by how
  // far along the path they are, so a tower only looks at enemies that can possibly be in range.

  function refreshWindows(tower) {
    const rangePixels = (statsOf(tower).range ?? 0) * TILE;
    const windows = [];
    if (rangePixels > 0) {
      const rangeSquared = rangePixels * rangePixels;
      let start = -1;
      for (let progress = 0; progress < table.size; progress += WINDOW_SAMPLE) {
        const dx = table.xs[progress] - tower.x;
        const dy = table.ys[progress] - tower.y;
        const inside = dx * dx + dy * dy <= rangeSquared;
        if (inside && start < 0) start = progress;
        if (!inside && start >= 0) {
          windows.push(start - WINDOW_SAMPLE, progress);
          start = -1;
        }
      }
      if (start >= 0) windows.push(start - WINDOW_SAMPLE, Infinity);
    }
    towerWork.get(tower).windows = windows;
  }

  function firstIndexAtOrAfter(progress) {
    let low = 0;
    let high = byProgress.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (byProgress[middle].progress < progress) low = middle + 1;
      else high = middle;
    }
    return low;
  }

  function enemiesInRange(tower) {
    candidates.length = 0;
    const { windows } = towerWork.get(tower);
    const rangePixels = statsOf(tower).range * TILE;
    const rangeSquared = rangePixels * rangePixels;
    for (let w = 0; w < windows.length; w += 2) {
      for (let i = firstIndexAtOrAfter(windows[w]); i < byProgress.length && byProgress[i].progress <= windows[w + 1]; i++) {
        const enemy = byProgress[i];
        if (enemy.hp <= 0) continue;
        const dx = enemy.x - tower.x;
        const dy = enemy.y - tower.y;
        if (dx * dx + dy * dy <= rangeSquared) candidates.push(enemy);
      }
    }
    return candidates;
  }

  function preference(tower, enemy) {
    switch (tower.targeting) {
      case 'last': return -enemy.progress;
      case 'strong': return enemy.hp;
      case 'close': return -((enemy.x - tower.x) ** 2 + (enemy.y - tower.y) ** 2);
      default: return enemy.progress;
    }
  }

  function bestTargets(tower, inRange, count) {
    if (count === 1) {
      let best = inRange[0];
      for (const enemy of inRange) if (preference(tower, enemy) > preference(tower, best)) best = enemy;
      return [best];
    }
    return inRange.slice().sort((a, b) => preference(tower, b) - preference(tower, a)).slice(0, count);
  }

  function enemiesNear(x, y, radius) {
    const radiusSquared = radius * radius;
    return game.enemies.filter((enemy) => enemy.hp > 0
      && (enemy.x - x) ** 2 + (enemy.y - y) ** 2 <= radiusSquared);
  }

  // Damage

  function armourOf(enemy) {
    const work = enemyWork.get(enemy);
    const broken = work && work.breakStep === stepCount ? work.armourBreak : 0;
    const armour = ENEMIES[enemy.type].armour + (enemy.mods.armoured ? RULES.armouredBonusArmour : 0);
    return Math.max(0, armour - broken);
  }

  function damageEnemy(enemy, rawDamage, damageType, tower, bossMultiplier) {
    if (enemy.hp <= 0) return;
    const boss = isBoss(enemy);
    let amount = rawDamage * (boss && bossMultiplier ? bossMultiplier : 1);
    if (damageType === 'magic') amount = enemy.mods.warded ? 0 : amount * (boss ? RULES.bossMagicTaken : 1);
    else amount = Math.max(1, amount - armourOf(enemy));
    enemy.hp -= amount;
    emit('hit', enemy.x, enemy.y, { amount, damageType, towerId: tower.id, enemyId: enemy.id });
    if (enemy.hp <= 0) {
      const modifiers = (enemy.mods.armoured ? 1 : 0) + (enemy.mods.warded ? 1 : 0);
      const bounty = Math.round(ENEMIES[enemy.type].bounty * RULES.modifierBountyMultiplier ** modifiers);
      game.gold += bounty;
      emit('kill', enemy.x, enemy.y, { amount: bounty, enemyId: enemy.id, towerId: tower.id });
    }
  }

  function freezeEnemy(enemy, seconds) {
    if (enemy.hp <= 0 || enemy.mods.warded || enemy.frozenFor > 0) return;
    const work = enemyWork.get(enemy);
    if (work && game.time < work.immuneUntil) return;
    enemy.frozenFor = isBoss(enemy) ? Math.min(seconds, RULES.bossFreezeMax) : seconds;
    emit('freeze', enemy.x, enemy.y, { amount: enemy.frozenFor, enemyId: enemy.id });
  }

  function workFor(enemy) {
    let work = enemyWork.get(enemy);
    if (!work) {
      work = { immuneUntil: 0, armourBreak: 0, breakStep: -1 };
      enemyWork.set(enemy, work);
    }
    return work;
  }

  // Towers

  function applyAuras() {
    for (const enemy of game.enemies) enemy.slow = 0;
    for (const tower of game.towers) {
      const stats = statsOf(tower);
      if (!stats.slow && !stats.armourBreak) continue;
      for (const enemy of enemiesInRange(tower)) {
        if (stats.slow) enemy.slow = Math.max(enemy.slow, isBoss(enemy) ? stats.slow * RULES.bossSlowFactor : stats.slow);
        if (stats.armourBreak) {
          const work = workFor(enemy);
          if (work.breakStep !== stepCount) {
            work.breakStep = stepCount;
            work.armourBreak = 0;
          }
          work.armourBreak = Math.max(work.armourBreak, stats.armourBreak);
        }
      }
    }
  }

  function fireTowers(dt) {
    for (const tower of game.towers) {
      tower.attackAnim += dt;
      const stats = statsOf(tower);
      if (stats.damage === undefined) continue;
      const work = towerWork.get(tower);
      work.cooldown -= dt;
      if (work.cooldown > 0) continue;
      const inRange = enemiesInRange(tower);
      if (inRange.length === 0) {
        work.cooldown = 0;
        tower.targetId = null;
        continue;
      }
      work.cooldown += stats.interval;
      attack(tower, work, stats, bestTargets(tower, inRange, stats.targets ?? stats.multishot ?? 1));
    }
  }

  function attack(tower, work, stats, targets) {
    const primary = targets[0];
    tower.targetId = primary.id;
    tower.angle = Math.atan2(primary.y - tower.y, primary.x - tower.x);
    tower.attackAnim = 0;
    work.attacks += 1;
    if (damageTypeOf(tower) === 'melee') {
      strike(tower, work, stats, targets);
    } else {
      for (let shot = 0; shot < (stats.multishot ?? 1); shot++) launch(tower, work, stats, targets[shot % targets.length]);
    }
  }

  function strike(tower, work, stats, targets) {
    const special = stats.special && work.attacks % stats.special.every === 0;
    const damage = special ? stats.special.damage : stats.damage;
    for (const target of targets) damageEnemy(target, damage, 'melee', tower, stats.bossMultiplier);
    if (stats.cleave) {
      const primary = targets[0];
      for (const enemy of enemiesNear(primary.x, primary.y, CLEAVE_RADIUS)) {
        if (enemy !== primary) damageEnemy(enemy, damage * stats.cleave, 'melee', tower, stats.bossMultiplier);
      }
    }
  }

  function projectileKind(tower, work, stats) {
    if (tower.type === 'bomber') return 'bomb';
    if (damageTypeOf(tower) === 'ranged') return tower.type === 'ranger' && tower.tier >= 2 ? 'bolt' : 'arrow';
    if (stats.chain) return 'storm';
    if (stats.freeze) return 'frost';
    if (tower.type === 'mage' && tower.tier === 0) return BASIC_SPELLS[work.spells++ % BASIC_SPELLS.length];
    return 'spell-fire';
  }

  function launch(tower, work, stats, target) {
    const angle = Math.atan2(target.y - tower.y, target.x - tower.x);
    const projectile = {
      id: nextId++, kind: projectileKind(tower, work, stats), x: tower.x, y: tower.y, prevX: tower.x, prevY: tower.y, angle,
    };
    projectileWork.set(projectile, { target, tower, stats });
    game.projectiles.push(projectile);
  }

  // Projectiles

  function moveProjectiles(dt) {
    let kept = 0;
    for (const projectile of game.projectiles) {
      const work = projectileWork.get(projectile);
      // A shot whose target has already died fizzles rather than choosing a new one.
      if (work.target.hp <= 0) continue;
      const dx = work.target.x - projectile.x;
      const dy = work.target.y - projectile.y;
      const distance = Math.hypot(dx, dy);
      const travel = PROJECTILE_SPEED * dt;
      projectile.prevX = projectile.x;
      projectile.prevY = projectile.y;
      projectile.angle = Math.atan2(dy, dx);
      if (distance <= travel) {
        impact(projectile, work);
        continue;
      }
      projectile.x += (dx / distance) * travel;
      projectile.y += (dy / distance) * travel;
      game.projectiles[kept++] = projectile;
    }
    game.projectiles.length = kept;
  }

  function enemiesInLine(target, angle, extra) {
    const directionX = Math.cos(angle);
    const directionY = Math.sin(angle);
    const inLine = [];
    for (const enemy of game.enemies) {
      if (enemy === target || enemy.hp <= 0) continue;
      const offsetX = enemy.x - target.x;
      const offsetY = enemy.y - target.y;
      const along = offsetX * directionX + offsetY * directionY;
      const across = Math.abs(offsetX * directionY - offsetY * directionX);
      if (along >= -PIERCE_HALF_WIDTH && along <= PIERCE_REACH && across <= PIERCE_HALF_WIDTH) {
        inLine.push({ enemy, along });
      }
    }
    return inLine.sort((a, b) => a.along - b.along).slice(0, extra).map((entry) => entry.enemy);
  }

  function impact(projectile, { target, tower, stats }) {
    const damageType = damageTypeOf(tower);
    const struck = new Set([target]);
    if (stats.pierce > 1) for (const enemy of enemiesInLine(target, projectile.angle, stats.pierce - 1)) struck.add(enemy);
    if (stats.splash) for (const enemy of enemiesNear(target.x, target.y, stats.splash * TILE)) struck.add(enemy);

    // Any splash shows where it landed: a spell ring for magic, an explosion for thrown bombs.
    if (stats.splash || stats.chain) {
      emit('spell', target.x, target.y, { amount: (stats.splash ?? 0) * TILE, damageType, towerId: tower.id });
    }
    for (const enemy of struck) damageEnemy(enemy, stats.damage, damageType, tower, stats.bossMultiplier);
    if (stats.freeze) for (const enemy of struck) freezeEnemy(enemy, stats.freeze);

    if (stats.chain) {
      let from = target;
      for (let link = 0; link < stats.chain.count; link++) {
        const next = enemiesNear(from.x, from.y, stats.chain.range * TILE)
          .filter((enemy) => !struck.has(enemy))
          .sort((a, b) => (a.x - from.x) ** 2 + (a.y - from.y) ** 2 - ((b.x - from.x) ** 2 + (b.y - from.y) ** 2))[0];
        if (!next) break;
        struck.add(next);
        damageEnemy(next, stats.damage * stats.chain.fraction, damageType, tower, stats.bossMultiplier);
        from = next;
      }
    }
  }

  // Enemies and waves

  function spawnDue() {
    while (spawnIndex < spawns.length && spawns[spawnIndex].time <= waveClock) {
      spawnEnemy(spawns[spawnIndex++].group);
    }
  }

  function spawnEnemy(group) {
    const base = ENEMIES[group.type];
    const mods = {
      armoured: group.armouredChance > 0 && rng.next() < group.armouredChance,
      warded: group.wardedChance > 0 && rng.next() < group.wardedChance,
    };
    const maxHp = Math.max(1, Math.round(base.hp * group.hpMultiplier));
    const start = { x: table.xs[0], y: table.ys[0] };
    const id = nextId++;
    game.enemies.push({
      id, type: group.type, mods, x: start.x, y: start.y, prevX: start.x, prevY: start.y,
      hp: maxHp, maxHp, progress: 0, slow: 0, frozenFor: 0, dir: 1,
    });
    if (base.boss) emit('boss', start.x, start.y, { enemyId: id });
  }

  function moveEnemies(dt) {
    for (const enemy of game.enemies) {
      if (enemy.hp <= 0) continue;
      enemy.prevX = enemy.x;
      enemy.prevY = enemy.y;
      if (enemy.frozenFor > 0) {
        enemy.frozenFor -= dt;
        if (enemy.frozenFor <= 0) {
          enemy.frozenFor = 0;
          workFor(enemy).immuneUntil = game.time + RULES.freezeImmunity;
        }
        continue;
      }
      enemy.progress += ENEMIES[enemy.type].speed * TILE * (1 - enemy.slow) * dt;
      if (enemy.progress >= map.pathLength) {
        leak(enemy);
        continue;
      }
      const index = Math.floor(enemy.progress);
      const fraction = enemy.progress - index;
      enemy.x = table.xs[index] + (table.xs[index + 1] - table.xs[index]) * fraction;
      enemy.y = table.ys[index] + (table.ys[index + 1] - table.ys[index]) * fraction;
      enemy.dir = table.dirs[index];
    }
  }

  function removeDead() {
    let kept = 0;
    for (const enemy of game.enemies) if (enemy.hp > 0) game.enemies[kept++] = enemy;
    game.enemies.length = kept;
  }

  function leak(enemy) {
    const lost = ENEMIES[enemy.type].leak;
    enemy.hp = 0;
    game.lives = Math.max(0, game.lives - lost);
    emit('leak', enemy.x, enemy.y, { amount: lost, enemyId: enemy.id });
    if (game.lives === 0) game.phase = 'lost';
  }

  function endWave() {
    game.gold += RULES.waveBonusBase + RULES.waveBonusPerWave * game.wave;
    for (const tower of game.towers) {
      const payout = statsOf(tower).payout;
      if (!payout) continue;
      game.gold += payout;
      emit('payout', tower.x, tower.y, { amount: payout, towerId: tower.id });
    }
    game.projectiles.length = 0;
    game.phase = game.wave >= RULES.winWave ? 'won' : 'build';
    emit('waveEnd', table.xs[table.size - 1], table.ys[table.size - 1], { amount: game.wave });
  }

  function startWave() {
    if (game.phase !== 'build' && game.phase !== 'won') return false;
    game.wave += 1;
    game.phase = 'wave';
    waveClock = 0;
    spawnIndex = 0;
    spawns = [];
    for (const group of buildWave(game.wave, rng)) {
      for (let i = 0; i < group.count; i++) spawns.push({ time: group.delay + i * group.gap, group });
    }
    spawns.sort((a, b) => a.time - b.time);
    emit('waveStart', table.xs[0], table.ys[0], { amount: game.wave });
    return true;
  }

  function step(dt) {
    if (game.phase !== 'wave') return;
    stepCount += 1;
    game.time += dt;
    waveClock += dt;
    spawnDue();
    byProgress.length = 0;
    for (const enemy of game.enemies) byProgress.push(enemy);
    byProgress.sort((a, b) => a.progress - b.progress);
    applyAuras();
    fireTowers(dt);
    moveProjectiles(dt);
    moveEnemies(dt);
    removeDead();
    if (game.phase === 'wave' && spawnIndex >= spawns.length && game.enemies.length === 0) endWave();
  }

  const game = {
    seed,
    gold: RULES.startGold,
    lives: RULES.startLives,
    wave: 0,
    phase: 'build',
    time: 0,
    map,
    towers: [],
    enemies: [],
    projectiles: [],
    step,
    place,
    canPlace,
    upgrade,
    sell,
    setTargeting,
    startWave,
    drainEvents() {
      const drained = events;
      events = [];
      return drained;
    },
  };
  return game;
}
