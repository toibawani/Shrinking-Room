// scripts/check-contrast.mjs
// Checks the design tokens against WCAG AA. Body text needs 4.5:1, large text
// and UI borders need 3:1. Exits non-zero if any pair in the system fails.
// Run: npm run check:contrast

const TOKENS = {
  bone: '#E7E2D6',
  bone2: '#DCD6C8',
  field: '#F3EFE6',
  ink: '#16150F',
  ink2: '#4A473D',
  signal: '#B8260F',
};

function channel(v) {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`bad hex: ${hex}`);
  const n = parseInt(m[1], 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

function ratio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

// Every text-on-surface pair the stylesheet is allowed to use.
// need: 4.5 body text, 3 large text (>= 28px) and non-text UI edges.
const PAIRS = [
  ['ink', 'bone', 4.5, 'body text on the page'],
  ['ink', 'bone2', 4.5, 'body text in inset panels'],
  ['ink', 'field', 4.5, 'text in inputs'],
  ['ink2', 'bone', 4.5, 'secondary text on the page'],
  ['ink2', 'bone2', 4.5, 'secondary text in inset panels'],
  ['ink2', 'field', 4.5, 'input hints'],
  ['signal', 'bone', 4.5, 'errors and danger text'],
  ['signal', 'field', 4.5, 'field errors'],
  ['bone', 'ink', 4.5, 'primary button label'],
  ['signal', 'bone', 3, 'focus outline against the page'],
  ['signal', 'field', 3, 'focus outline against inputs'],
  ['ink', 'bone', 3, '2px borders against the page'],
  ['ink', 'bone2', 3, 'borders against inset panels'],
  ['ink', 'field', 3, 'borders against inputs'],
];

// The token set does not support signal text on bone2 (4.36:1), so the system
// forbids that pairing instead of lowering the bar. If someone adds it to the
// stylesheet this script will not catch it, but the rule is written down here.
const FORBIDDEN = [['signal', 'bone2', 'danger text on inset panels: use bone or field instead']];

let failed = 0;
console.log('text and surface pairs');
for (const [fg, bg, need, why] of PAIRS) {
  const r = ratio(TOKENS[fg], TOKENS[bg]);
  const ok = r >= need;
  if (!ok) failed++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${r.toFixed(2)}:1  need ${need}:1  ${fg} on ${bg}  (${why})`);
}

console.log('\nforbidden pairings');
for (const [fg, bg, why] of FORBIDDEN) {
  const r = ratio(TOKENS[fg], TOKENS[bg]);
  console.log(`  ${r < 4.5 ? 'ok  ' : 'FAIL'} ${r.toFixed(2)}:1  ${fg} on ${bg}  (${why})`);
  if (r >= 4.5) failed++; // the exclusion is no longer needed; fold it back into PAIRS
}

if (failed) {
  console.error(`\n${failed} contrast check(s) failed`);
  process.exit(1);
}
console.log('\nall pairs pass');
