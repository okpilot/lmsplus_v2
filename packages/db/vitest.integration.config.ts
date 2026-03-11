import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/__integration__/**/*.integration.test.ts'],
    exclude: ['node_modules'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
