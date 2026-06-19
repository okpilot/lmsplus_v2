import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // No pool override: each test file runs in its own worker (default `forks`
    // pool), so module-level state in shared helpers (e.g. the `suffix =
    // Date.now()` in src/__integration__/vfr-rt-helpers.ts) is initialised
    // per-file. Today's files are collision-free via distinct per-describe
    // org-slug/email prefixes (see that helper's header), NOT via the suffix
    // alone. Before adding `singleThread`/`vmThreads` — which would share that
    // module state across files — confirm every helper file still keys its seed
    // rows uniquely without relying on per-file module isolation.
    environment: 'node',
    globals: true,
    include: ['src/__integration__/**/*.integration.test.ts'],
    exclude: ['node_modules'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
