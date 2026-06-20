import path from 'node:path'
import { defineConfig } from 'vitest/config'

// App-layer DB integration tier (#925): runs real apps/web query code + Server
// Actions against a real local Postgres (no Supabase mocking). Node environment,
// separate file glob from the unit suite so the two never overlap.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['**/*.integration.test.ts'],
    exclude: ['node_modules', '.next'],
    // Mocks `next/headers`/`next/cache`/`next/navigation` once for the whole tier
    // so `createServerSupabaseClient()` reads a real session from an in-memory
    // cookie jar (see the setup file). Reset per-test there.
    setupFiles: ['./vitest.integration.setup.ts'],
    // Per-file process isolation is load-bearing: each test file authenticates its
    // own in-memory cookie jar on globalThis (see the setup file), so files must NOT
    // share a process. The forks pool gives each file its own process — do not switch
    // to a shared-thread pool or the jars would clobber each other across files.
    pool: 'forks',
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      // Resolve @supabase/supabase-js via the packages/db install (same as the unit config).
      '@supabase/supabase-js': path.resolve(
        __dirname,
        '../../packages/db/node_modules/@supabase/supabase-js',
      ),
    },
  },
})
