import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // No pool override: each test file runs in its own worker (default `forks`
    // pool), so module-level state in shared helpers (e.g. the `suffix` in
    // src/__integration__/vfr-rt-helpers.ts) is initialised per-file. All those
    // workers share ONE Postgres, and literal code/slug/email prefixes ARE
    // reused across files, so isolation rests on `fixtureSuffix()` carrying real
    // entropy — not on the prefixes. Before adding `singleThread`/`vmThreads`,
    // which would share that module state across files, confirm every helper
    // file still keys its seed rows uniquely without per-file module isolation.
    environment: 'node',
    globals: true,
    include: ['src/__integration__/**/*.integration.test.ts'],
    exclude: ['node_modules'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
