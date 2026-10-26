// Every balance number in the game lives here so tuning never touches logic.
// Ranges and speeds are in tiles and tiles per second; the simulation converts to pixels.
// Each tower's tiers hold full stats (not deltas): tier 0 is the base tower, tiers 1 to 3 are upgrades.
// Keys are a contract with the renderer and the genetic algorithm: values may change, keys may not.

export const TILE = 32;

export const RULES = {
  startGold: 1000,
  startLives: 99,
  sellRefund: 0.7,
  step: 1 / 30,
  winWave: 40,
  freeplayHpGrowth: 1.08,
  waveBonusBase: 200,
  waveBonusPerWave: 20,
  // An enemy that has just thawed cannot be frozen again for this long, so freeze never becomes a permanent stop.
  freezeImmunity: 2,
  bossFreezeMax: 0.3,
  bossSlowFactor: 0.5,
  bossMagicTaken: 0.75,
  armouredBonusArmour: 5,
  modifierBountyMultiplier: 1.5,
};

// Terrain: '.' grass, '#' path, '=' bridge, '~' water, 'T' tree, 'R' rock, 'C' castle.
// Only grass is buildable.
export const MAP = {
  name: 'Mill Vale',
  terrain: [
    'TTTT....TT....TT...~~....TTTTT',
    'TT.......T...T.....~~........T',
    '................R..~~.........',
    '######.......R.....~~.........',
    '.....#.............~~..#####..',
    'T....#.R...........~~..#...#..',
    'TT...#.....#######..~~.#...#.T',
    'T....#.....#.....#..~~.#...#.T',
    '.....#.....#.....#..~~.#.T.#..',
    '.....#...R.#.....#..~~.#...#CC',
    '..####.....#..T..#..~~.#R..#CC',
    '..#........#.....#..~~.#...#CC',
    '..#.....T..#.....#..~~.#...###',
    '..#.R......#.R...#.~~..#....CC',
    '..#........#.....##==###....CC',
    '..#........#.......~~.......CC',
    '..##########.......~~.....R...',
    '...................~~.........',
    'T......T.......T...~~....T....',
    'TT....TT......TT...~~...T.TT..',
  ],
  // Path corners in tile coordinates. Enemies walk tile centres; the first and last points sit off the map.
  waypoints: [
    [-1, 3], [5, 3], [5, 10], [2, 10], [2, 16], [11, 16], [11, 6], [17, 6],
    [17, 14], [23, 14], [23, 4], [27, 4], [27, 12], [30, 12],
  ],
};


const outfit = (head, body, legs, cape, weapon, colours) => ({ head, body, legs, cape, weapon, colours });

// damageType: 'melee' | 'ranged' | 'magic' | 'none'.
// Optional stats: pierce (enemies one shot passes through), splash (tiles), freeze (s), slow (fraction),
// armourBreak, cleave (fraction to enemies within 0.75 tile), bossMultiplier, targets (hit this many at once),
// multishot, chain {count, range, fraction}, special {every, damage}, payout (gp per wave end).
// A chain's range must be larger than the tower's splash: the first jump starts at the target, and the splash has
// already struck everything nearer than that.
export const TOWERS = {
  pure: {
    name: 'Pure',
    blurb: 'A level 70 pure. Cheap, quick and hopeless against armour.',
    cost: 150,
    damageType: 'melee',
    tiers: [
      { name: 'Iron sabre', cost: 0, stats: { damage: 3, interval: 0.6, range: 1.6 },
        outfit: outfit('bandana', 'vest', 'chaps', 'none', 'sabre',
          { primary: '#6b4a2b', secondary: '#3b5f8a', metal: '#9aa0a6', accent: '#b03a2e' }) },
      { name: 'Runed sabre', cost: 100, stats: { damage: 5, interval: 0.6, range: 1.6 },
        outfit: outfit('bandana', 'vest', 'chaps', 'cape', 'sabre',
          { primary: '#6b4a2b', secondary: '#3b5f8a', metal: '#4fb3bf', accent: '#b03a2e' }) },
      { name: 'Wyrm sabre and cliff boots', cost: 250, stats: { damage: 7, interval: 0.5, range: 1.6 },
        outfit: outfit('bandana', 'vest', 'chaps', 'cape', 'sabre',
          { primary: '#2e2a26', secondary: '#3b5f8a', metal: '#c0392b', accent: '#1d1d1d' }) },
      { name: 'Stone maul', cost: 600,
        stats: { damage: 9, interval: 0.5, range: 1.6, special: { every: 5, damage: 40 } },
        outfit: outfit('bandana', 'vest', 'chaps', 'cape', 'maul',
          { primary: '#2e2a26', secondary: '#3b5f8a', metal: '#7d7f7d', accent: '#8e1b1b' }) },
    ],
  },
  ranger: {
    name: 'Ranger',
    blurb: 'Long reach. Pierces lines of enemies once upgraded.',
    cost: 300,
    damageType: 'ranged',
    tiers: [
      { name: 'Shortbow', cost: 0, stats: { damage: 3, interval: 0.5, range: 3.5 },
        outfit: outfit('coif', 'leather', 'chaps', 'none', 'bow',
          { primary: '#8a5a2b', secondary: '#5c3d1e', metal: '#9aa0a6', accent: '#3e7d3a' }) },
      { name: 'Green hide and longbow', cost: 150, stats: { damage: 4, interval: 0.45, range: 3.5 },
        outfit: outfit('coif', 'hide', 'chaps', 'none', 'longbow',
          { primary: '#3e7d3a', secondary: '#2b5728', metal: '#9aa0a6', accent: '#8a5a2b' }) },
      { name: 'Black hide and crossbow', cost: 400, stats: { damage: 9, interval: 0.6, range: 3.5, pierce: 2 },
        outfit: outfit('coif', 'hide', 'chaps', 'cape', 'crossbow',
          { primary: '#26282b', secondary: '#151618', metal: '#4fb3bf', accent: '#3e7d3a' }) },
      { name: 'Starwood bow and eagle armour', cost: 1500,
        stats: { damage: 18, interval: 0.5, range: 5, pierce: 3, bossMultiplier: 2 },
        outfit: outfit('hood', 'hide', 'chaps', 'cape', 'greatbow',
          { primary: '#d8cfae', secondary: '#4a5a3a', metal: '#d4a017', accent: '#d4a017' }) },
    ],
  },
  mage: {
    name: 'Mage',
    blurb: 'Elemental bolts that ignore armour. Upgrades to a freezing barrage.',
    cost: 400,
    damageType: 'magic',
    tiers: [
      { name: 'Elemental bolts', cost: 0, stats: { damage: 8, interval: 1.0, range: 3.0 },
        outfit: outfit('wizard-hat', 'robe', 'robe-skirt', 'none', 'staff',
          { primary: '#2f4f9e', secondary: '#1f356b', metal: '#8a5a2b', accent: '#e6c84f' }) },
      { name: 'Starweave robes and fire burst', cost: 200, stats: { damage: 14, interval: 0.9, range: 3.0 },
        outfit: outfit('hood', 'robe', 'robe-skirt', 'none', 'staff-orb',
          { primary: '#1f2f6b', secondary: '#c9c3b2', metal: '#8a5a2b', accent: '#e8702a' }) },
      { name: 'Frost volley', cost: 600,
        stats: { damage: 12, interval: 0.9, range: 3.0, splash: 1, freeze: 1 },
        outfit: outfit('hood', 'robe', 'robe-skirt', 'cape', 'staff-orb',
          { primary: '#1f2f6b', secondary: '#c9c3b2', metal: '#8a5a2b', accent: '#7fd6f0' }) },
      { name: 'Elder robes and blizzard', cost: 1400,
        stats: { damage: 22, interval: 0.8, range: 3.0, splash: 1.25, freeze: 1.5 },
        outfit: outfit('hood', 'robe', 'robe-skirt', 'cape', 'staff-orb',
          { primary: '#3a2a4f', secondary: '#7a1f2b', metal: '#d4a017', accent: '#7fd6f0' }) },
    ],
  },
  tank: {
    name: 'Tank',
    blurb: 'Hits softly, but everything near it walks through treacle.',
    cost: 350,
    damageType: 'melee',
    tiers: [
      { name: 'Iron plate', cost: 0, stats: { damage: 2, interval: 1.0, range: 2.0, slow: 0.3 },
        outfit: outfit('full-helm', 'plate', 'plate-legs', 'none', 'sword-shield',
          { primary: '#8d9399', secondary: '#5f656b', metal: '#b9bfc4', accent: '#7a5230' }) },
      { name: 'Runed plate', cost: 200, stats: { damage: 2, interval: 1.0, range: 2.0, slow: 0.4 },
        outfit: outfit('full-helm', 'plate', 'plate-legs', 'none', 'sword-shield',
          { primary: '#3f9aa6', secondary: '#2a6f78', metal: '#7fd0da', accent: '#b03a2e' }) },
      { name: 'Crypt armour', cost: 500, stats: { damage: 6, interval: 1.0, range: 2.5, slow: 0.5 },
        outfit: outfit('full-helm', 'plate', 'plate-legs', 'cape', 'sword-shield',
          { primary: '#4a4f45', secondary: '#2f332c', metal: '#8a8f80', accent: '#5a2a5a' }) },
      { name: 'Arbiter armour', cost: 1200,
        stats: { damage: 6, interval: 1.0, range: 2.5, slow: 0.6, armourBreak: 2 },
        outfit: outfit('full-helm', 'plate', 'plate-legs', 'cape', 'sword-shield',
          { primary: '#e8e4d8', secondary: '#b8b2a0', metal: '#d4a017', accent: '#d4a017' }) },
    ],
  },
  zerker: {
    name: 'Zerker',
    blurb: 'Low defence, big hits. The answer to armour.',
    cost: 600,
    damageType: 'melee',
    tiers: [
      { name: 'Iron chain', cost: 0, stats: { damage: 14, interval: 1.0, range: 1.8 },
        outfit: outfit('horned-helm', 'chain', 'trousers', 'none', 'sword',
          { primary: '#7d8389', secondary: '#4a3a2a', metal: '#b9bfc4', accent: '#8e1b1b' }) },
      { name: "Brawler's vest and parrying blade", cost: 300, stats: { damage: 18, interval: 0.9, range: 1.8 },
        outfit: outfit('horned-helm', 'torso', 'trousers', 'none', 'sword-defender',
          { primary: '#9e2a2a', secondary: '#4a3a2a', metal: '#b9bfc4', accent: '#d4a017' }) },
      { name: 'Demon whip', cost: 700, stats: { damage: 20, interval: 0.6, range: 1.8 },
        outfit: outfit('horned-helm', 'torso', 'trousers', 'cape', 'whip',
          { primary: '#9e2a2a', secondary: '#4a3a2a', metal: '#3a3a3a', accent: '#d4a017' }) },
      { name: 'Glassrock set and fury amulet', cost: 1600,
        stats: { damage: 32, interval: 0.6, range: 1.8, cleave: 0.5 },
        outfit: outfit('horned-helm', 'plate', 'plate-legs', 'cape', 'whip',
          { primary: '#1d1b22', secondary: '#2f2a35', metal: '#e8702a', accent: '#e8702a' }) },
    ],
  },
  flipper: {
    name: 'Flipper',
    blurb: 'Buys low, sells high. Pays out gold at the end of every wave.',
    cost: 500,
    damageType: 'none',
    tiers: [
      { name: 'Market stall', cost: 0, stats: { payout: 60 },
        outfit: outfit('none', 'tunic', 'trousers', 'none', 'coin-bag',
          { primary: '#7a6a3a', secondary: '#4a3a2a', metal: '#e6c84f', accent: '#e6c84f' }) },
      { name: 'Flipper', cost: 300, stats: { payout: 120 },
        outfit: outfit('none', 'tunic', 'trousers', 'cape', 'coin-bag',
          { primary: '#3b5f8a', secondary: '#4a3a2a', metal: '#e6c84f', accent: '#e6c84f' }) },
      { name: 'Merchant', cost: 700, stats: { payout: 220 },
        outfit: outfit('crown', 'robe', 'robe-skirt', 'cape', 'coin-bag',
          { primary: '#5a2a7a', secondary: '#d4a017', metal: '#e6c84f', accent: '#d4a017' }) },
      { name: 'Bank stack', cost: 1500, stats: { payout: 400 },
        outfit: outfit('party-hat', 'robe', 'robe-skirt', 'cape', 'coin-bag',
          { primary: '#5a2a7a', secondary: '#d4a017', metal: '#e6c84f', accent: '#e8e4d8' }) },
    ],
  },
  maxMelee: {
    name: 'Max melee',
    blurb: 'Every skill at 99. Devastating up close, priced to match.',
    cost: 3000,
    damageType: 'melee',
    tiers: [
      { name: 'Max melee', cost: 0, stats: { damage: 60, interval: 0.6, range: 2.2 },
        outfit: outfit('full-helm', 'plate', 'plate-legs', 'cape-max', 'sword',
          { primary: '#3a3f45', secondary: '#23272b', metal: '#c0392b', accent: '#d4a017' }) },
      { name: 'Titan plate', cost: 2500, stats: { damage: 80, interval: 0.6, range: 2.2 },
        outfit: outfit('full-helm', 'plate', 'plate-legs', 'cape-max', 'sword',
          { primary: '#5a4a3a', secondary: '#3a2e24', metal: '#c0392b', accent: '#d4a017' }) },
      { name: 'Reaper scythe', cost: 4000, stats: { damage: 90, interval: 0.6, range: 2.2, targets: 3 },
        outfit: outfit('full-helm', 'plate', 'plate-legs', 'cape-max', 'scythe',
          { primary: '#5a4a3a', secondary: '#3a2e24', metal: '#b03a6a', accent: '#d4a017' }) },
      { name: 'Ember cape and soul axe', cost: 7000,
        stats: { damage: 120, interval: 0.5, range: 2.2, targets: 3, bossMultiplier: 1.5 },
        outfit: outfit('horned-helm', 'plate', 'plate-legs', 'cape-max', 'axe',
          { primary: '#2a1d1a', secondary: '#4a1f14', metal: '#e8702a', accent: '#f0b030' }) },
    ],
  },
  maxRanger: {
    name: 'Max ranger',
    blurb: 'Every skill at 99, bow in hand. Shoots across half the map.',
    cost: 3000,
    damageType: 'ranged',
    tiers: [
      { name: 'Max ranger', cost: 0, stats: { damage: 40, interval: 0.5, range: 6, pierce: 2 },
        outfit: outfit('hood', 'hide', 'chaps', 'cape-max', 'greatbow',
          { primary: '#3e5a2a', secondary: '#26381a', metal: '#d4a017', accent: '#c0392b' }) },
      { name: 'Wyrmhide set', cost: 2500, stats: { damage: 55, interval: 0.5, range: 6, pierce: 2 },
        outfit: outfit('hood', 'hide', 'chaps', 'cape-max', 'greatbow',
          { primary: '#7a2a2a', secondary: '#4a1a1a', metal: '#d4a017', accent: '#c0392b' }) },
      { name: 'Bane bow', cost: 4000,
        stats: { damage: 55, interval: 0.5, range: 6, pierce: 4, bossMultiplier: 2 },
        outfit: outfit('hood', 'hide', 'chaps', 'cape-max', 'greatbow',
          { primary: '#7a2a2a', secondary: '#4a1a1a', metal: '#7fd6f0', accent: '#c0392b' }) },
      { name: 'Twinshot', cost: 7000,
        stats: { damage: 80, interval: 0.4, range: 6, pierce: 4, bossMultiplier: 2, multishot: 2 },
        outfit: outfit('crown', 'hide', 'chaps', 'cape-max', 'greatbow',
          { primary: '#d8cfae', secondary: '#4a5a3a', metal: '#7fd6f0', accent: '#d4a017' }) },
    ],
  },
  maxMage: {
    name: 'Max mage',
    blurb: 'Every skill at 99, staff raised. Wide blasts that ignore armour.',
    cost: 3000,
    damageType: 'magic',
    tiers: [
      { name: 'Max mage', cost: 0, stats: { damage: 45, interval: 0.8, range: 4.5, splash: 1.25 },
        outfit: outfit('hood', 'robe', 'robe-skirt', 'cape-max', 'staff-orb',
          { primary: '#4a2a6a', secondary: '#2a1a3f', metal: '#d4a017', accent: '#b07fe0' }) },
      { name: 'Archmage robes', cost: 2500, stats: { damage: 65, interval: 0.8, range: 4.5, splash: 1.5 },
        outfit: outfit('wizard-hat', 'robe', 'robe-skirt', 'cape-max', 'staff-orb',
          { primary: '#2a2a5a', secondary: '#d4a017', metal: '#d4a017', accent: '#b07fe0' }) },
      { name: 'Blizzard', cost: 4000,
        stats: { damage: 65, interval: 0.8, range: 4.5, splash: 2, freeze: 1.5 },
        outfit: outfit('wizard-hat', 'robe', 'robe-skirt', 'cape-max', 'staff-orb',
          { primary: '#2a2a5a', secondary: '#d4a017', metal: '#d4a017', accent: '#7fd6f0' }) },
      { name: 'Storm crown', cost: 7000,
        stats: { damage: 100, interval: 0.8, range: 4.5, splash: 2, freeze: 1.5,
          chain: { count: 4, range: 3, fraction: 0.6 } },
        outfit: outfit('crown', 'robe', 'robe-skirt', 'cape-max', 'staff-orb',
          { primary: '#1a1a3a', secondary: '#7fd6f0', metal: '#e6c84f', accent: '#f4f0a0' }) },
    ],
  },
};

export const TOWER_ORDER = ['pure', 'ranger', 'mage', 'tank', 'zerker', 'flipper', 'maxMelee', 'maxRanger', 'maxMage'];

// size: sprite class the renderer draws ('small' 16 px, 'medium' 24 px, 'large' 32 px, 'boss' 48 px).
// cost: the wave generator's spending unit, equal to bounty.
export const ENEMIES = {
  chicken: { name: 'Chicken', hp: 6, speed: 1.6, armour: 0, bounty: 3, leak: 1, size: 'small', unlock: 1 },
  goblin: { name: 'Goblin', hp: 14, speed: 1.3, armour: 0, bounty: 5, leak: 1, size: 'small', unlock: 2 },
  cow: { name: 'Cow', hp: 30, speed: 1.0, armour: 0, bounty: 6, leak: 2, size: 'medium', unlock: 4 },
  imp: { name: 'Imp', hp: 10, speed: 2.6, armour: 0, bounty: 5, leak: 2, size: 'small', unlock: 6 },
  guard: { name: 'Guard', hp: 80, speed: 1.1, armour: 4, bounty: 15, leak: 3, size: 'medium', unlock: 8 },
  hillGiant: { name: 'Hill giant', hp: 120, speed: 0.8, armour: 0, bounty: 18, leak: 5, size: 'large', unlock: 12 },
  bogGiant: { name: 'Bog giant', hp: 200, speed: 0.8, armour: 1, bounty: 24, leak: 6, size: 'large', unlock: 15 },
  blackKnight: { name: 'Black knight', hp: 220, speed: 1.0, armour: 6, bounty: 30, leak: 6, size: 'medium', unlock: 18 },
  fireGiant: { name: 'Fire giant', hp: 450, speed: 0.75, armour: 2, bounty: 45, leak: 10, size: 'large', unlock: 24 },
  dragonGreen: { name: 'Green dragon', hp: 500, speed: 0.45, armour: 2, bounty: 250, leak: 35, size: 'boss', boss: true },
  dragonBlue: { name: 'Blue dragon', hp: 4000, speed: 0.45, armour: 4, bounty: 500, leak: 99, size: 'boss', boss: true },
  dragonRed: { name: 'Red dragon', hp: 12000, speed: 0.45, armour: 5, bounty: 900, leak: 99, size: 'boss', boss: true },
  dragonBlack: { name: 'Black dragon', hp: 30000, speed: 0.45, armour: 6, bounty: 1500, leak: 99, size: 'boss', boss: true },
};

// Modifiers on regular enemies. Armoured adds RULES.armouredBonusArmour; warded is immune to magic and freeze.
export const MODIFIERS = {
  armoured: { fromWave: 14 },
  warded: { fromWave: 16 },
};

export const BOSS_WAVES = { 10: 'dragonGreen', 20: 'dragonBlue', 30: 'dragonRed', 40: 'dragonBlack' };

// Waves 1 to 10 are written by hand so the opening teaches each enemy in turn.
// A group spawns `count` enemies `gap` seconds apart, starting `delay` seconds into the wave.
// Waves 1 to 5 leak 121 hitpoints in total, so a player who builds nothing loses by wave 5.
export const OPENING_WAVES = [
  [{ type: 'chicken', count: 14, gap: 0.8, delay: 0 }],
  [{ type: 'chicken', count: 12, gap: 0.7, delay: 0 }, { type: 'goblin', count: 8, gap: 0.9, delay: 4 }],
  [{ type: 'goblin', count: 10, gap: 0.7, delay: 0 }, { type: 'chicken', count: 10, gap: 0.6, delay: 3 },
    { type: 'goblin', count: 6, gap: 0.6, delay: 9 }],
  [{ type: 'goblin', count: 15, gap: 0.6, delay: 0 }, { type: 'cow', count: 4, gap: 1.5, delay: 5 }],
  [{ type: 'goblin', count: 12, gap: 0.5, delay: 0 }, { type: 'cow', count: 8, gap: 1.2, delay: 3 },
    { type: 'chicken', count: 10, gap: 0.4, delay: 8 }],
  [{ type: 'imp', count: 10, gap: 0.8, delay: 0 }, { type: 'goblin', count: 10, gap: 0.5, delay: 2 },
    { type: 'cow', count: 6, gap: 1.0, delay: 6 }],
  [{ type: 'goblin', count: 20, gap: 0.4, delay: 0 }, { type: 'cow', count: 10, gap: 0.9, delay: 3 },
    { type: 'imp', count: 6, gap: 0.6, delay: 9 }],
  [{ type: 'guard', count: 6, gap: 1.5, delay: 0 }, { type: 'goblin', count: 15, gap: 0.4, delay: 2 },
    { type: 'imp', count: 8, gap: 0.5, delay: 8 }],
  [{ type: 'cow', count: 10, gap: 0.8, delay: 0 }, { type: 'guard', count: 10, gap: 1.2, delay: 3 },
    { type: 'imp', count: 10, gap: 0.4, delay: 10 }],
  [{ type: 'goblin', count: 10, gap: 0.4, delay: 0 }, { type: 'guard', count: 6, gap: 1.0, delay: 2 },
    { type: 'dragonGreen', count: 1, gap: 0, delay: 6 }],
];

// From wave 11: count = min(countCap, round(countBase * countGrowth^(wave - 10))) and every enemy's HP is
// multiplied by hpGrowth^(wave - 10). Count growth is kept slow so late waves stay cheap to simulate.
export const WAVE_FORMULA = {
  countBase: 20,
  countGrowth: 1.04,
  countCap: 120,
  hpGrowth: 1.06,
  gapStart: 0.6,
  gapMin: 0.2,
  gapShrinkPerWave: 0.012,
  // Chance an eligible enemy gets each modifier, rising per wave after its first wave, capped.
  modifierChanceStart: 0.1,
  modifierChancePerWave: 0.02,
  modifierChanceCap: 0.45,
};

export const GA = {
  populationSize: 24,
  genomeLength: 40,
  tournamentSize: 3,
  mutationRate: 0.08,
  slotNudge: 3,
  elites: 2,
  trainingSeed: 1,
  slotCount: 60,
};
