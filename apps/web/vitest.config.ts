import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    // Restore every vi.spyOn spy to its original before each test. A per-test
    // spy.mockRestore() is skipped when an earlier expect() throws, leaking the
    // spy (installed on a prototype/global) into later tests; this flag closes
    // that leak class globally so no per-file afterEach net is needed (#929).
    restoreMocks: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.test.{ts,tsx}'],
    // Integration tests run in a separate node-env tier against real Postgres
    // (vitest.integration.config.ts). Exclude them from the jsdom unit run —
    // the `**/*.test.{ts,tsx}` glob would otherwise ingest `*.integration.test.ts`.
    exclude: ['node_modules', '.next', '**/*.integration.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
      thresholds: { lines: 60, branches: 50, functions: 60 },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      // e2e helpers import @supabase/supabase-js directly; resolve via packages/db symlink
      '@supabase/supabase-js': path.resolve(
        __dirname,
        '../../packages/db/node_modules/@supabase/supabase-js',
      ),
    },
  },
})
