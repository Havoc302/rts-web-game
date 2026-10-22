import assert from 'assert';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROD_DIR, listTree, prodFileList } from '../../scripts/prod-manifest.mjs';

console.log('=== prod-build.case.js ===');

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const publishedDir = join(root, PROD_DIR);

assert.ok(existsSync(publishedDir), `${PROD_DIR}/ should exist; run npm run build:prod`);

// The published folder must be a byte-for-byte copy of the runtime files, so what the web server
// hands out is exactly what this build tested. `npm test` rebuilds it first via `pretest`.
const expected = prodFileList(root);
assert.ok(expected.includes('index.html') && expected.includes('style.css'), 'The manifest should list the page itself');
assert.ok(expected.some((file) => file.startsWith('src/engine/')), 'The manifest should include the engine sources');

for (const file of expected) {
  const published = join(publishedDir, file);
  assert.ok(existsSync(published), `${PROD_DIR}/${file} is missing; run npm run build:prod`);
  assert.ok(readFileSync(published).equals(readFileSync(join(root, file))),
    `${PROD_DIR}/${file} differs from the source; run npm run build:prod`);
}

// Nothing else may be published: dev-only folders (tests, docs, scripts, node_modules, .git) and
// stray files would otherwise be reachable from the web root.
const published = listTree(publishedDir).filter((file) => file !== 'README.md');
assert.deepStrictEqual(published, expected,
  `The snapshot should hold exactly the runtime files; run npm run build:prod`);

console.log('Production snapshot tests passed.');
