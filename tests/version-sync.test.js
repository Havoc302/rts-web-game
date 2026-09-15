import assert from 'assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_VERSION } from '../src/version.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

assert.strictEqual(pkg.version, APP_VERSION, 'package.json version must match src/version.js APP_VERSION');
assert.ok(/^\d+\.\d+\.\d+$/.test(APP_VERSION), 'APP_VERSION must be semver major.minor.patch');

console.log('Version sync tests passed.');
