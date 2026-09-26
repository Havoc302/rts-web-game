// Single source of truth for the public version string.
// Import this (or APP_VERSION re-exported from config.js) everywhere a version
// is displayed, cache-busted, or asserted. Keep package.json "version" in sync;
// tests/version-sync.test.js fails if they drift.
export const APP_VERSION = '0.1.29';
