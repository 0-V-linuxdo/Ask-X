import { build, context } from 'esbuild';
import { copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { METADATA } from '../src/meta.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OUTFILE = path.join(root, 'dist', 'Ask X.user.js');
// Same file under a URL-friendly name, for installing from a local server.
const URL_COPY = path.join(root, 'dist', 'ask-x.user.js');
const options = {
  entryPoints: [path.join(root, 'src', 'main.js')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  charset: 'utf8',
  legalComments: 'none',
  banner: { js: METADATA },
  outfile: OUTFILE,
  logLevel: 'info'
};

if (process.argv.includes('--watch')) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('[ask-x] watching…');
} else {
  await build(options);
  copyFileSync(OUTFILE, URL_COPY);
  console.log(`[ask-x] wrote ${path.relative(root, OUTFILE)}`);
}
