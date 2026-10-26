// A 5 x 7 bitmap font for text drawn on the canvas, so the game needs no font files.
// Each glyph is seven rows of five pixels, '1' for ink. Text is drawn in capitals.

const GLYPHS = {
  A: '01110 10001 10001 11111 10001 10001 10001',
  B: '11110 10001 10001 11110 10001 10001 11110',
  C: '01110 10001 10000 10000 10000 10001 01110',
  D: '11110 10001 10001 10001 10001 10001 11110',
  E: '11111 10000 10000 11110 10000 10000 11111',
  F: '11111 10000 10000 11110 10000 10000 10000',
  G: '01110 10001 10000 10111 10001 10001 01111',
  H: '10001 10001 10001 11111 10001 10001 10001',
  I: '01110 00100 00100 00100 00100 00100 01110',
  J: '00111 00010 00010 00010 00010 10010 01100',
  K: '10001 10010 10100 11000 10100 10010 10001',
  L: '10000 10000 10000 10000 10000 10000 11111',
  M: '10001 11011 10101 10101 10001 10001 10001',
  N: '10001 11001 10101 10011 10001 10001 10001',
  O: '01110 10001 10001 10001 10001 10001 01110',
  P: '11110 10001 10001 11110 10000 10000 10000',
  Q: '01110 10001 10001 10001 10101 10010 01101',
  R: '11110 10001 10001 11110 10100 10010 10001',
  S: '01111 10000 10000 01110 00001 00001 11110',
  T: '11111 00100 00100 00100 00100 00100 00100',
  U: '10001 10001 10001 10001 10001 10001 01110',
  V: '10001 10001 10001 10001 10001 01010 00100',
  W: '10001 10001 10001 10101 10101 11011 10001',
  X: '10001 10001 01010 00100 01010 10001 10001',
  Y: '10001 10001 01010 00100 00100 00100 00100',
  Z: '11111 00001 00010 00100 01000 10000 11111',
  0: '01110 10001 10011 10101 11001 10001 01110',
  1: '00100 01100 00100 00100 00100 00100 01110',
  2: '01110 10001 00001 00010 00100 01000 11111',
  3: '11110 00001 00001 01110 00001 00001 11110',
  4: '00010 00110 01010 10010 11111 00010 00010',
  5: '11111 10000 11110 00001 00001 10001 01110',
  6: '00110 01000 10000 11110 10001 10001 01110',
  7: '11111 00001 00010 00100 01000 01000 01000',
  8: '01110 10001 10001 01110 10001 10001 01110',
  9: '01110 10001 10001 01111 00001 00010 01100',
  '.': '00000 00000 00000 00000 00000 01100 01100',
  ',': '00000 00000 00000 00000 01100 00100 01000',
  ':': '00000 01100 01100 00000 01100 01100 00000',
  '-': '00000 00000 00000 11111 00000 00000 00000',
  '+': '00000 00100 00100 11111 00100 00100 00000',
  '/': '00001 00001 00010 00100 01000 10000 10000',
  '(': '00010 00100 01000 01000 01000 00100 00010',
  ')': '01000 00100 00010 00010 00010 00100 01000',
  '%': '11001 11010 00010 00100 01000 01011 10011',
  "'": '00100 00100 01000 00000 00000 00000 00000',
  '?': '01110 10001 00001 00010 00100 00000 00100',
};

const COLUMNS = 5;
const ADVANCE = COLUMNS + 1;

// One Path2D per glyph, built once, so a character costs a single fill however many pixels it has.
const paths = new Map();

function glyphPath(character) {
  if (!paths.has(character)) {
    const path = new Path2D();
    const rows = (GLYPHS[character] || '').split(' ');
    rows.forEach((row, y) => {
      for (let x = 0; x < COLUMNS; x++) if (row[x] === '1') path.rect(x, y, 1, 1);
    });
    paths.set(character, path);
  }
  return paths.get(character);
}

export function textWidth(text, scale = 2) {
  return text.length === 0 ? 0 : (text.length * ADVANCE - 1) * scale;
}

/**
 * Draws capital-letter pixel text. The shadow keeps it readable over both grass and water.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} x Left edge, or centre or right edge depending on align.
 * @param {number} y Top edge.
 * @param {{scale?: number, colour?: string, shadow?: string | null, align?: 'left' | 'center' | 'right'}} [style]
 */
export function drawText(ctx, text, x, y, { scale = 2, colour = '#f1e6c8', shadow = '#1b1712', align = 'left' } = {}) {
  const upper = text.toUpperCase();
  const width = textWidth(upper, scale);
  const left = Math.round(align === 'center' ? x - width / 2 : align === 'right' ? x - width : x);
  const top = Math.round(y);
  const pass = (dx, dy, fill) => {
    ctx.fillStyle = fill;
    [...upper].forEach((character, index) => {
      ctx.save();
      ctx.translate(left + index * ADVANCE * scale + dx, top + dy);
      ctx.scale(scale, scale);
      ctx.fill(glyphPath(character));
      ctx.restore();
    });
  };
  if (shadow) pass(scale, scale, shadow);
  pass(0, 0, colour);
}

/** Breaks text into lines of at most maxChars characters, splitting at spaces. */
export function wrapText(text, maxChars) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}
