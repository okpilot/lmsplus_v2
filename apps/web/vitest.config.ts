import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.test.{ts,tsx}'],
    exclude: ['node_modules', '.next'],
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
