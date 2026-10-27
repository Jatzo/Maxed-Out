// Syntax check and house-style scan. Exits 1, naming file and line, on any problem it finds.
import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { extname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const selfPath = fileURLToPath(import.meta.url);
const SKIPPED_FOLDERS = new Set(['node_modules']);
// Local working notes that never reach the repository.
const SKIPPED_FILES = new Set(['CLAUDE.md', 'KICKOFF.md']);
const SCANNED = new Set(['.js', '.mjs', '.html', '.css', '.md']);

// The dashes and the emoji selector are built from character codes so this file does not trip its own scan.
// Property names in data.js and waves.js use `unlock`, so that word is only banned when it is not a key or a
// property access. This file names the banned words to look for them, so the word rules skip it.
const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);
const EMOJI = new RegExp(`\\p{Extended_Pictographic}|${String.fromCharCode(0xfe0f)}`, 'u');
const RULES = [
  { reason: 'em dash or en dash', pattern: DASHES },
  { reason: 'emoji', pattern: EMOJI },
  {
    reason: 'banned word',
    pattern: /\b(?:leverag|seamless|robust|delv|comprehensive|cutting-edge|powerful|streamlin|elevat|harness|claude|anthropic|llm)\w*/i,
    wordRule: true,
  },
  { reason: 'banned word', pattern: /(?<![.\w])unlock(?!\s*:)\w*/i, wordRule: true },
  { reason: 'banned word', pattern: /\bAI\b/, wordRule: true },
  // The map and weapons may look like the game's, but its place names stay out of every shipped file.
  { reason: 'game place name', pattern: /\b(?:lumbridge|varrock|falador|draynor|gielinor)\w*/i, wordRule: true },
];

function listFiles(folder) {
  const found = [];
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIPPED_FOLDERS.has(entry.name)) continue;
    const full = join(folder, entry.name);
    if (entry.isDirectory()) found.push(...listFiles(full));
    else if (!SKIPPED_FILES.has(entry.name)) found.push(full);
  }
  return found;
}

const shown = (file) => relative(root, file).split(sep).join('/');

function syntaxProblem(file) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.error) return `${shown(file)}: the syntax check could not run (${result.error.message})`;
  if (result.status === 0) return null;
  const line = /:(\d+)\r?\n/.exec(result.stderr)?.[1] ?? '1';
  const message = result.stderr.split(/\r?\n/).find((text) => /Error/.test(text)) ?? '';
  return `${shown(file)}:${line}: syntax error. ${message}`.trim();
}

const problems = [];
const files = listFiles(root).sort();

for (const file of files) {
  const extension = extname(file);
  if (extension === '.js' || extension === '.mjs') {
    const problem = syntaxProblem(file);
    if (problem) problems.push(problem);
  }
  if (!SCANNED.has(extension)) continue;
  readFileSync(file, 'utf8').split(/\r?\n/).forEach((text, index) => {
    for (const rule of RULES) {
      if (rule.wordRule && file === selfPath) continue;
      const match = rule.pattern.exec(text);
      if (match) problems.push(`${shown(file)}:${index + 1}: ${rule.reason} "${match[0]}"`);
    }
  });
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  console.error(`${problems.length} problem${problems.length === 1 ? '' : 's'} found in ${files.length} files.`);
  process.exit(1);
}
console.log(`Checked ${files.length} files: syntax and house style are clean.`);
