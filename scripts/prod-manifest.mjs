// What the published site is allowed to contain. Everything else in the repo (tests, docs, the
// task log, node_modules, .git) is development-only and must never be exposed by the web server.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** The folder that is copied to the web server. */
export const PROD_DIR = 'simconquer2000';

/** Files at the repository root that the browser loads directly. */
export const PROD_ROOT_FILES = ['index.html', 'style.css'];

/** Directories copied wholesale. `src` is entirely self-contained; the audio folder holds the BGM. */
export const PROD_DIRECTORIES = ['src', 'assets/audio'];

/** Recursive file listing, relative to `directory`, using forward slashes and sorted for stable diffs. */
export function listTree(directory) {
  const found = [];
  const walk = (relative) => {
    for (const entry of readdirSync(join(directory, relative), { withFileTypes: true })) {
      const child = relative === '.' ? entry.name : `${relative}/${entry.name}`;
      if (entry.isDirectory()) walk(child);
      else found.push(child);
    }
  };
  walk('.');
  return found.sort();
}

/** Every file the published snapshot should contain, relative to the repository root. */
export function prodFileList(root = process.cwd()) {
  const files = [...PROD_ROOT_FILES];
  for (const directory of PROD_DIRECTORIES) {
    if (!existsSync(join(root, directory))) continue;
    files.push(...listTree(join(root, directory)).map((file) => `${directory}/${file}`));
  }
  return files.sort();
}
