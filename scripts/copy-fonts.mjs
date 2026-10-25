// Copies the latin woff2 subsets we actually use out of the fontsource
// packages and into public/fonts, so the game serves its own type and never
// calls a font CDN. Run after changing font weights: npm run fonts
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'fonts');

// [package, weight, output name]
const FONTS = [
  ['@fontsource/big-shoulders-display', '800', 'big-shoulders-display-800.woff2'],
  ['@fontsource/ibm-plex-sans', '400', 'ibm-plex-sans-400.woff2'],
  ['@fontsource/ibm-plex-sans', '500', 'ibm-plex-sans-500.woff2'],
  ['@fontsource/ibm-plex-sans', '600', 'ibm-plex-sans-600.woff2'],
  ['@fontsource/jetbrains-mono', '500', 'jetbrains-mono-500.woff2'],
  ['@fontsource/jetbrains-mono', '700', 'jetbrains-mono-700.woff2'],
];

const LICENSES = [
  ['@fontsource/big-shoulders-display', 'big-shoulders-display-LICENSE.txt'],
  ['@fontsource/ibm-plex-sans', 'ibm-plex-sans-LICENSE.txt'],
  ['@fontsource/jetbrains-mono', 'jetbrains-mono-LICENSE.txt'],
];

mkdirSync(outDir, { recursive: true });

for (const [pkg, weight, outName] of FONTS) {
  const family = pkg.split('/')[1];
  const src = join(root, 'node_modules', pkg, 'files', `${family}-latin-${weight}-normal.woff2`);
  if (!existsSync(src)) {
    console.error(`missing ${src} — run npm install first`);
    process.exit(1);
  }
  copyFileSync(src, join(outDir, outName));
  console.log(`copied ${outName}`);
}

for (const [pkg, outName] of LICENSES) {
  const src = join(root, 'node_modules', pkg, 'LICENSE');
  if (!existsSync(src)) {
    console.error(`missing license in ${pkg}`);
    process.exit(1);
  }
  copyFileSync(src, join(outDir, outName));
  console.log(`copied ${outName}`);
}
