import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { METADATA, NAME, RELEASE, VERSION } from '../src/meta.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = await readFile(path.join(root, 'dist', 'Ask X.user.js'), 'utf8');

const fail = (message) => { throw new Error(`[ask-x verify] ${message}`); };
const tag = (key) => [...METADATA.matchAll(new RegExp(`^//\\s+@${key}\\s+(.+)$`, 'gm'))].map((m) => m[1].trim());

if (tag('name').length !== 1 || tag('name')[0] !== NAME) fail('@name must be the plain script name');
if (!/^\d+(\.\d+)*$/.test(VERSION) || tag('version')[0] !== VERSION) fail('@version must be numeric');
if (!tag('update-log')[0]?.startsWith(`[${RELEASE}] v${VERSION} - `)) fail('@update-log must match release and version');
if (!bundle.startsWith(METADATA)) fail('bundle must start with the metadata block');
if (/^\s*(import|export)\s/m.test(bundle.slice(METADATA.length))) fail('bundle still has bare import/export');
for (const marker of ['GrokDrawer', 'ica55d24', 'd285710e', 'askx-bar', '{quote}', 'GM_setValue', 'askx-card', 'QuickPrompts']) {
  if (!bundle.includes(marker)) fail(`missing marker ${marker}`);
}
console.log('[ask-x verify] metadata and bundle look good');
