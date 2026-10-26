# Maxed Out

A tower defence game for the browser, in the style of Bloons TD, built around the account builds of Old School RuneScape: a level 70 pure, a ranger, a mage, a tank, a zerker, a flipper and three maxed accounts. Every tower is pixel art drawn in code, and every upgrade changes its outfit. An optional auto-play mode runs a genetic algorithm that learns where to build, and you can watch it improve.

![Wave 20 at four times speed: a blue dragon slowed by a frost volley while hitsplats land on giants and knights](docs/demo.gif)

> **Unofficial fan project.** Maxed Out is a non-commercial fan project inspired by Old School RuneScape. It is not affiliated with or endorsed by Jagex Ltd, which owns the Old School RuneScape trade mark. It uses no Jagex art, music, logos, item names or place names. The sprites, gear names and map are original.

## Play it

You need Node.js 22 or later. There is nothing to install.

```
npm start
```

Then open http://localhost:5173. The page has to come from a server because browsers block module scripts and workers on `file://`. If you would rather not use Node, `python -m http.server 5173 --bind 127.0.0.1` from the project folder works too.

Pick a tower from the shop (keys 1 to 9), click a grass tile to place it, click a tower to upgrade it, sell it or change what it targets. Space starts the next wave. Clear wave 40 to win, then keep going in freeplay if you like.

## Towers

| Tower | Cost | Good at | Weak against |
|---|---|---|---|
| Pure | 150 | Cheap early damage | Armour |
| Ranger | 300 | Reach; later shots pierce a line | Heavy armour |
| Mage | 400 | Ignores armour; freezes from tier 2 | Warded enemies |
| Tank | 350 | Slows everything nearby, later breaks armour | Doing damage |
| Zerker | 600 | Big hits through armour | Short reach |
| Flipper | 500 | 60 to 400 gold at the end of each wave | Everything, it does not fight |
| Max melee, ranger, mage | 3,000 each | The late waves and the dragons | Your gold |

Physical damage loses the target's armour from every hit, down to a minimum of 1. Magic ignores armour, but warded enemies take none of it and cannot be frozen. Slows do not stack, and bosses shrug off half of a slow and most of a freeze. Every tenth wave brings a dragon. All of the numbers live in [`src/core/data.js`](src/core/data.js).

![Every tower at every tier, and every enemy plain, armoured, warded and frozen](docs/screenshots/sheet-1440.png)

## What this demonstrates

- **A deterministic simulation.** The game runs in fixed steps of 1/30 of a second with a seeded random number generator, so a seed and a build order always play out the same way. The browser, the tests and the genetic algorithm all run the same code. See `createGame` in [`src/core/sim.js`](src/core/sim.js).
- **Targeting without a distance check per enemy.** Each tower works out once which stretches of the path its range covers. Enemies are kept in order of how far they have walked, so finding targets is a binary search rather than a check of every tower against every enemy. A full 40-wave game takes about 0.4 seconds headless. See `refreshWindows` and `enemiesInRange` in [`src/core/sim.js`](src/core/sim.js).
- **A genetic algorithm that visibly learns.** A genome is a list of 40 build orders (a tower type and a tile). On an empty tile the order places that tower; on an occupied one it upgrades what is there. The algorithm uses tournament selection, one-point crossover, three kinds of mutation and two elites. It runs in a web worker while the page replays the latest champion at four times speed, and it keeps its progress between visits. See [`src/core/ga.js`](src/core/ga.js), [`src/core/policy.js`](src/core/policy.js) and [`src/ga-worker.js`](src/ga-worker.js).
- **Balance checked by bots.** [`scripts/balance.mjs`](scripts/balance.mjs) plays fixed strategies against the real simulation and fails if any target is missed. Building nothing loses by wave 5. Cheap pures alone die by wave 11, and mages alone by wave 18, because armour and warded enemies each counter one of them. A hand-written mixed build clears all 40 waves on five different seeds and kills all 20 dragons. With `--ga`, a population starting from random build orders lifts its median wave from 4 or 5 to 37 to 40 within 15 generations, on each of three seeds.
- **Pixel art drawn in code.** Sprites are small grids of palette colours. Each tower is one body with layered legs, body, cape, head and weapon pieces, tinted per tier, so 36 outfits come from a handful of pieces. Composed sprites are cached on offscreen canvases. See `buildTower` in [`src/render/sprites.js`](src/render/sprites.js).
- **One state contract between two halves.** The simulation and the renderer only meet through the shapes in [`src/core/contract.js`](src/core/contract.js). A test runs a real game to the middle of a wave and checks it has exactly the fields the renderer was built against.

There are 75 tests, run with Node's built-in test runner. `npm test` first runs [`scripts/check.mjs`](scripts/check.mjs), which checks every file's syntax and the house style.

```
npm test
node scripts/balance.mjs
node scripts/balance.mjs --ga
```

## Licence

The code and the original art in this repository are under the [MIT licence](LICENSE). That covers nothing belonging to Jagex Ltd.
