import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import os from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Test files are independent processes that write nothing to disk, so they run in parallel:
// Node startup dominates the cheap files, and the few heavy generators overlap instead of
// queueing. Output is buffered per file and printed in filename order, so a failing run reads
// exactly as it would serially. Override the worker count with TEST_CONCURRENCY=<n>.
const testsDir = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(testsDir)
  .filter((name) => name.endsWith('.test.js'))
  .sort();

const requested = Number(process.env.TEST_CONCURRENCY);
const cpuCount = typeof os.availableParallelism === 'function'
  ? os.availableParallelism()
  : (os.cpus() || []).length || 2;
const concurrency = Math.max(1, Math.min(
  files.length,
  Number.isFinite(requested) && requested > 0 ? Math.floor(requested) : cpuCount * 2,
));

function runFile(file) {
  return new Promise((resolve) => {
    const startedAt = process.hrtime.bigint();
    const child = spawn(process.execPath, [join(testsDir, file)], { env: process.env });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => {
      resolve({ file, status: 1, stdout, stderr: `${stderr}${error.message}\n`, ms: 0 });
    });
    child.on('close', (status) => {
      const ms = Number((process.hrtime.bigint() - startedAt) / 1000000n);
      resolve({ file, status: status ?? 1, stdout, stderr, ms });
    });
  });
}

const results = new Array(files.length);
let next = 0;
const startedAt = Date.now();

async function worker() {
  while (next < files.length) {
    const index = next;
    next += 1;
    results[index] = await runFile(files[index]);
  }
}

await Promise.all(Array.from({ length: concurrency }, worker));

let failed = 0;
let slowest = { file: '', ms: 0 };
for (const result of results) {
  console.log(`\n=== ${result.file} ===`);
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) failed += 1;
  if (result.ms > slowest.ms) slowest = { file: result.file, ms: result.ms };
}

const totalMs = Date.now() - startedAt;
if (failed > 0) {
  console.error(`\n${failed} test file(s) failed.`);
  console.error(`Finished in ${totalMs} ms with ${concurrency} parallel workers.`);
  process.exit(1);
}
console.log(`\nAll ${files.length} test files passed.`);
console.log(`Finished in ${totalMs} ms with ${concurrency} parallel workers (slowest: ${slowest.file} at ${slowest.ms} ms).`);
