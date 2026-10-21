// Runs several case files in one process. Cases are imported in order and their top-level
// assertions run as the module loads; a failure is recorded and the rest still run, so a failing
// case cannot hide the others the way a single bundled assert chain would.
//
// Globals that a case installs for itself (a partial `document`, a fake `localStorage`) are
// restored after it, so one case cannot leak its stubs into the next.
const STUBBED_GLOBALS = ['document', 'localStorage', 'AbortController'];

export async function runCases(baseUrl, caseFiles) {
  const failures = [];
  for (const specifier of caseFiles) {
    const saved = STUBBED_GLOBALS.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
    try {
      await import(new URL(specifier, baseUrl).href);
    } catch (error) {
      failures.push(specifier);
      console.error(`\n!!! ${specifier} failed\n${error?.stack ?? error}\n`);
    } finally {
      for (const [key, descriptor] of saved) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    }
  }
  if (failures.length > 0) {
    console.error(`${failures.length} case file(s) failed: ${failures.join(', ')}`);
    process.exit(1);
  }
}
