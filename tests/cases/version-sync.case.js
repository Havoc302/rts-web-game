import assert from 'assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_VERSION } from '../../src/version.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

assert.strictEqual(pkg.version, APP_VERSION, 'package.json version must match src/version.js APP_VERSION');
assert.ok(/^\d+\.\d+\.\d+$/.test(APP_VERSION), 'APP_VERSION must be semver major.minor.patch');

// The stylesheet URL is cache-keyed from index.html, which is served fresh: if the key drifts from the
// release version, a deploy leaves browsers on the previous style.css.
const markup = readFileSync(join(root, 'index.html'), 'utf8');
const stylesheetKey = markup.match(/<link rel="stylesheet" href="style\.css\?v=([^"]+)">/);
assert.ok(stylesheetKey, 'index.html should load style.css with a ?v= build key');
assert.strictEqual(stylesheetKey[1], APP_VERSION,
  `index.html keys style.css as v${stylesheetKey[1]} but APP_VERSION is ${APP_VERSION}`);

console.log('Version sync tests passed.');
