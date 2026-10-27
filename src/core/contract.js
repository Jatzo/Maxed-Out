// Shapes shared by the simulation, the renderer, the interface and the worker. No logic lives here.
// All positions are in pixels on the 960 x 640 logical map. The renderer and interface only read game state;
// every change goes through the Game methods below.

/**
 * @typedef {'melee' | 'ranged' | 'magic' | 'none'} DamageType
 * @typedef {'build' | 'wave' | 'won' | 'lost'} Phase
 * @typedef {'first' | 'last' | 'strong' | 'close'} Targeting
 */

/**
 * @typedef {object} GameMap
 * @property {number} cols
 * @property {number} rows
 * @property {number} tileSize
 * @property {string[]} terrain One string per row, characters as in data.js MAP.
 * @property {{x: number, y: number}[]} path Polyline of path corners in pixels, start to end.
 * @property {number} pathLength Total path length in pixels.
 * @property {{col: number, row: number, score: number}[]} slots Buildable tiles ranked by path coverage, best first.
 */

/**
 * @typedef {object} TowerState
 * @property {number} id
 * @property {string} type Key of TOWERS in data.js.
 * @property {number} tier 0 to 3.
 * @property {number} col
 * @property {number} row
 * @property {number} x Tile centre.
 * @property {number} y Tile centre.
 * @property {number} angle Radians towards the current or last target, for facing.
 * @property {number} attackAnim Seconds since the last attack started, for the swing or cast frame.
 * @property {number | null} targetId
 * @property {Targeting} targeting
 * @property {number} spent Gold spent on this tower including upgrades, for the sell refund.
 */

/**
 * @typedef {object} EnemyState
 * @property {number} id
 * @property {string} type Key of ENEMIES in data.js.
 * @property {{armoured: boolean, warded: boolean}} mods
 * @property {number} x
 * @property {number} y
 * @property {number} prevX Position at the previous step, so the renderer can interpolate between steps.
 * @property {number} prevY
 * @property {number} hp
 * @property {number} maxHp
 * @property {number} progress Distance walked along the path in pixels.
 * @property {number} slow Current slow fraction, 0 when unslowed.
 * @property {number} frozenFor Seconds of freeze left.
 * @property {number} dir Facing: -1 left, 1 right.
 */

/**
 * @typedef {object} ProjectileState
 * @property {number} id
 * @property {'arrow' | 'bolt' | 'spell-air' | 'spell-water' | 'spell-earth' | 'spell-fire' | 'frost' | 'storm' | 'bomb'} kind
 * @property {number} x
 * @property {number} y
 * @property {number} prevX
 * @property {number} prevY
 * @property {number} angle
 */

/**
 * @typedef {object} GameEvent
 * @property {'hit' | 'kill' | 'leak' | 'payout' | 'spell' | 'freeze' | 'place' | 'upgrade' | 'sell' | 'waveStart' | 'waveEnd' | 'boss'} type
 * @property {number} x
 * @property {number} y
 * @property {number} [amount] Damage, gold or hitpoints, depending on type.
 * @property {DamageType} [damageType]
 * @property {number} [towerId]
 * @property {number} [enemyId]
 */

/**
 * @typedef {object} Game
 * @property {number} seed
 * @property {number} gold
 * @property {number} lives
 * @property {number} wave Waves started so far; 0 before the first.
 * @property {Phase} phase
 * @property {number} time Simulated seconds.
 * @property {GameMap} map
 * @property {TowerState[]} towers
 * @property {EnemyState[]} enemies
 * @property {ProjectileState[]} projectiles
 * @property {(dt: number) => void} step Advances by dt seconds in fixed RULES.step increments.
 * @property {(type: string, col: number, row: number) => {ok: boolean, reason?: string}} place
 * @property {(type: string, col: number, row: number) => boolean} canPlace
 * @property {(towerId: number) => {ok: boolean, reason?: string}} upgrade
 * @property {(towerId: number) => {ok: boolean, refund?: number}} sell
 * @property {(towerId: number, targeting: Targeting) => void} setTargeting
 * @property {() => boolean} startWave Only in the build phase.
 * @property {() => GameEvent[]} drainEvents Returns and clears events. Called by main.js only.
 */

/**
 * Genome for the genetic algorithm. Each gene is a tower type and a slot index into map.slots.
 * Policy: empty slot, place that type; occupied slot, upgrade whatever stands there (skip at tier 3);
 * unaffordable, stop buying until the next build phase. The list loops when exhausted.
 * @typedef {{type: string, slot: number}[]} Genome
 */

/**
 * Messages between the page and src/ga-worker.js. The page owns localStorage; the worker never touches it.
 * Page to worker:
 *   {type: 'start', seed: number, resume?: {generation: number, population: Genome[], history: GenerationSummary[]}}
 *   {type: 'stop'}
 * Worker to page:
 *   {type: 'progress', generation: number, index: number, total: number}
 *   {type: 'generation', summary: GenerationSummary, population: Genome[], champion: Genome}
 * @typedef {object} GenerationSummary
 * @property {number} generation
 * @property {number} best Best fitness this generation.
 * @property {number} mean
 * @property {number} bestSoFar
 * @property {number} bestWave Wave reached by this generation's champion.
 * @property {Record<string, number>} towerMix Count of each tower type the champion built.
 */

export {};
