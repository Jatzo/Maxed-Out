// A small line chart of fitness per generation, drawn with the same pixel font as the game.
import { drawText } from '../render/font.js';

export const CHART_SERIES = [
  ['best', 'Best', '#e6c84f'],
  ['mean', 'Mean', '#7fb6e8'],
  ['bestSoFar', 'Best so far', '#6fd46f'],
];

const PAD = { left: 52, right: 10, top: 10, bottom: 22 };

function compact(value) {
  if (value >= 10000) return `${Math.round(value / 1000)}K`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return String(Math.round(value));
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {import('../core/contract.js').GenerationSummary[]} history
 */
export function drawChart(canvas, history) {
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  ctx.fillStyle = '#2a2118';
  ctx.fillRect(0, 0, width, height);

  const plotWidth = width - PAD.left - PAD.right;
  const plotHeight = height - PAD.top - PAD.bottom;
  const top = Math.max(1, ...history.flatMap((summary) => CHART_SERIES.map(([key]) => summary[key])));

  ctx.fillStyle = '#4a3b2a';
  for (let k = 0; k <= 4; k++) ctx.fillRect(PAD.left, Math.round(PAD.top + (plotHeight * k) / 4), plotWidth, 1);
  ctx.fillRect(PAD.left, PAD.top, 1, plotHeight);

  drawText(ctx, compact(top), PAD.left - 6, PAD.top - 2, { align: 'right', colour: '#c8b48a', shadow: null });
  drawText(ctx, '0', PAD.left - 6, PAD.top + plotHeight - 12, { align: 'right', colour: '#c8b48a', shadow: null });
  if (history.length === 0) {
    drawText(ctx, 'Waiting for generation 1', PAD.left + plotWidth / 2, PAD.top + plotHeight / 2 - 7, { align: 'center', colour: '#c8b48a', shadow: null });
    return;
  }
  drawText(ctx, `Generation ${history[history.length - 1].generation}`, PAD.left + plotWidth, height - 16, { align: 'right', colour: '#c8b48a', shadow: null });

  const xAt = (index) => PAD.left + (history.length === 1 ? plotWidth / 2 : (plotWidth * index) / (history.length - 1));
  const yAt = (value) => PAD.top + plotHeight - (plotHeight * value) / top;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  for (const [key, , colour] of CHART_SERIES) {
    ctx.strokeStyle = colour;
    ctx.fillStyle = colour;
    ctx.beginPath();
    history.forEach((summary, index) => (index ? ctx.lineTo(xAt(index), yAt(summary[key])) : ctx.moveTo(xAt(index), yAt(summary[key]))));
    ctx.stroke();
    ctx.fillRect(Math.round(xAt(history.length - 1)) - 2, Math.round(yAt(history[history.length - 1][key])) - 2, 4, 4);
  }
}
