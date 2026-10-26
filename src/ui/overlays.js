// The title screen and the win and loss screens. One dialog element is reused for all three.
import { RULES } from '../core/data.js';
import { el } from './panel.js';

const DISCLAIMER = 'Maxed Out is an unofficial, non-commercial fan project inspired by Old School RuneScape. It is not affiliated with or endorsed by Jagex Ltd. All art is original and drawn in code.';

const overlay = () => document.getElementById('overlay');

function show(card) {
  const root = overlay();
  root.replaceChildren(card);
  root.hidden = false;
  card.querySelector('button')?.focus();
}

function button(label, onClick, kind = '') {
  const node = el('button', { class: `button big ${kind}`.trim(), type: 'button', text: label });
  node.addEventListener('click', onClick);
  return node;
}

export function hideOverlay() {
  overlay().hidden = true;
}

/** @param {{onPlay: () => void, onLearn: () => void, notice?: string}} handlers */
export function showTitle({ onPlay, onLearn, notice }) {
  show(el(
    'div',
    { class: 'card title-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'title-heading' },
    el('h1', { id: 'title-heading', text: 'Maxed Out' }),
    el('p', { class: 'subtitle', text: 'Build an account one tower at a time and stop the dragons at the castle gate.' }),
    el('div', { class: 'row' }, button('Play', onPlay, 'primary'), button('Watch it learn', onLearn)),
    el('p', { class: 'blurb', text: 'Watch it learn lets a computer try builds, keep the best and get better each generation.' }),
    ...(notice ? [el('p', { class: 'notice', role: 'alert', text: notice })] : []),
    el('p', { class: 'disclaimer', text: DISCLAIMER }),
  ));
}

/** @param {{lives: number, onAgain: () => void, onKeepGoing: () => void}} details */
export function showWin({ lives, onAgain, onKeepGoing }) {
  show(el(
    'div',
    { class: 'card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'end-heading' },
    el('h1', { id: 'end-heading', text: 'The castle held' }),
    el('p', { class: 'subtitle', text: `All ${RULES.winWave} waves cleared with ${lives} hitpoints left. The waves keep coming if you want to see how far this build goes.` }),
    el('div', { class: 'row' }, button('Keep going', onKeepGoing, 'primary'), button('Play again', onAgain)),
  ));
}

/** @param {{wave: number, onAgain: () => void}} details */
export function showLoss({ wave, onAgain }) {
  show(el(
    'div',
    { class: 'card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'end-heading' },
    el('h1', { id: 'end-heading', text: 'The castle has fallen' }),
    el('p', { class: 'subtitle', text: `You reached wave ${wave} of ${RULES.winWave}. Try a different mix of towers, or spend more on upgrades before the dragons.` }),
    el('div', { class: 'row' }, button('Play again', onAgain, 'primary')),
  ));
}
