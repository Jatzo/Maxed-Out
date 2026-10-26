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

// A hand-built mixed strategy. Rangers and mages stand in the middle of the path's loops (slots 0, 33 to 37),
// where their reach covers several stretches of path; melee towers stand on inside corners (slots 2 to 5, 11,
// 13), the only tiles where a short reach touches two stretches. The max builds arrive from about wave 20.
const gene = (type, slot) => ({ type, slot });
export const REFERENCE_GENOME = [
  gene('pure', 2), gene('ranger', 0), gene('pure', 3), gene('ranger', 0), gene('mage', 34), gene('tank', 4),
  gene('zerker', 5), gene('ranger', 33), gene('mage', 34), gene('ranger', 0), gene('ranger', 33), gene('zerker', 5),
  gene('mage', 35), gene('mage', 34), gene('ranger', 33), gene('zerker', 11), gene('mage', 35), gene('tank', 4),
  gene('zerker', 5), gene('ranger', 0), gene('mage', 34), gene('zerker', 11), gene('maxRanger', 36),
  gene('mage', 35), gene('tank', 4), gene('maxMage', 37), gene('maxRanger', 36), gene('ranger', 33),
  gene('maxMelee', 13), gene('maxMage', 37), gene('maxRanger', 36), gene('maxMage', 37), gene('maxMelee', 13),
  gene('maxRanger', 36), gene('maxMage', 37), gene('maxMelee', 13), gene('maxRanger', 32), gene('maxMage', 38),
  gene('maxRanger', 32), gene('maxMelee', 13),
];
