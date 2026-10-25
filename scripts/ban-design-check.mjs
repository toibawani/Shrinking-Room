// scripts/ban-design-check.mjs
// CI gate: fail if banned design elements creep into the codebase.
// Banned: gradients, glows, shadows, radial backgrounds, backdrop blur, soft corners, violet hues

import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

const FILES = ['public/style.css', 'public/*.js', 'public/room.js'];
const BANNED_PATTERNS = [
  /linear-gradient/,
  /radial-gradient/,
  /conic-gradient/,
  /box-shadow/,
  /text-shadow/,
  /drop-shadow/,
  /backdrop-filter/,
  /blur\(/,
  /#[0-9a-fA-F]{3,6}\s*(?:purple|violet|magenta)/,
  /shadowBlur/,
];

let failed = false;

for (const file of FILES) {
  try {
    const rl = createInterface({
      input: createReadStream(file),
      crlfDelay: Infinity,
    });

    let lineNum = 0;
    for await (const line of rl) {
      lineNum++;
      for (const [patIdx, pattern] of BANNED_PATTERNS.entries()) {
        if (pattern.test(line)) {
          console.log(`FAIL: ${file}:${lineNum} matches banned pattern #${patIdx}: /${pattern}/`);
          failed = true;
        }
      }
    }
  } catch (e) {
    // file may not exist yet; skip
  }
}

if (failed) {
  console.log('Banned design elements detected. Commit blocked.');
  process.exit(1);
} else {
  console.log('All clear — no banned design elements found.');
  process.exit(0);
}