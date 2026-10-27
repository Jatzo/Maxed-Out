/**
 * A strategy that plays a genome (see contract.js): empty slot, place the gene's tower; occupied slot, upgrade
 * whatever stands there; a purchase it cannot afford ends the turn and is retried in the next build phase.
 * The list loops when exhausted. Call act once per build phase.
 * @param {import('./contract.js').Genome} genome
 */
export function createPolicy(genome) {
  let cursor = 0;

  function towerAt(game, slot) {
    return game.towers.find((tower) => tower.col === slot.col && tower.row === slot.row);
  }

  function act(game) {
    // A full pass with nothing bought means every tower in the list is fully upgraded, so looping would never end.
    let idleGenes = 0;
    while (idleGenes < genome.length) {
      const gene = genome[cursor];
      const slot = game.map.slots[gene.slot];
      const tower = towerAt(game, slot);
      if (tower && tower.tier === 3) {
        cursor = (cursor + 1) % genome.length;
        idleGenes += 1;
        continue;
      }
      const result = tower ? game.upgrade(tower.id) : game.place(gene.type, slot.col, slot.row);
      if (!result.ok) return;
      cursor = (cursor + 1) % genome.length;
      idleGenes = 0;
    }
  }

  return { act };
}

// A hand-built mixed strategy. A ranger and the max builds stand in the pocket between the last climb and the castle
// gate (slots 0 to 3) and inside the left-hand loop (slots 9 to 20), where their reach covers several stretches of
// path; melee towers stand on inside corners (slots 4 to 7, 11, 13). Four flippers pay for the max rangers that
// carry the late waves.
const gene = (type, slot) => ({ type, slot });
export const REFERENCE_GENOME = [
  gene('ranger', 0), gene('pure', 4), gene('pure', 5), gene('flipper', 54), gene('mage', 31), gene('zerker', 7),
  gene('flipper', 55), gene('tank', 6), gene('ranger', 0), gene('mage', 31), gene('flipper', 50), gene('zerker', 7),
  gene('maxRanger', 9), gene('flipper', 51), gene('maxRanger', 14), gene('mage', 32), gene('maxRanger', 16), gene('maxRanger', 9),
  gene('maxRanger', 17), gene('maxRanger', 14), gene('maxMage', 3), gene('maxRanger', 19), gene('maxRanger', 16), gene('maxRanger', 20),
  gene('maxRanger', 17), gene('maxMage', 3), gene('maxRanger', 9), gene('maxRanger', 19), gene('zerker', 11), gene('maxRanger', 14),
  gene('maxRanger', 20), gene('maxMage', 3), gene('maxRanger', 16), gene('maxRanger', 17), gene('maxRanger', 19), gene('maxRanger', 20),
  gene('maxMelee', 13), gene('maxMage', 3), gene('maxMelee', 13), gene('maxMelee', 13),
];
