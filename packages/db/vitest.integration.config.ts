import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // No pool override: each test file runs in its own worker (default `forks`
    // pool), so module-level state in shared helpers (e.g. the `suffix` in
    // src/__integration__/vfr-rt-helpers.ts) is initialised per-file. All those
    // workers share ONE Postgres, and literal code/slug/email prefixes ARE
    // reused across files, so isolation rests on `fixtureSuffix()` carrying real
    // entropy — not on the prefixes. `isolate: false` is the one setting that
    // would share that module state across files in a worker; before adding it,
    // confirm every helper still keys its seed rows uniquely.
    environment: 'node',
    globals: true,
    include: ['src/__integration__/**/*.integration.test.ts'],
    exclude: ['node_modules'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
