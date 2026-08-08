// Typed router-mock factory (#1157).
//
// Most `useRouter` mocks in apps/web are structurally typed via `as unknown as T`
// casts or hand-rolled object literals, so a breaking change to Next's
// `AppRouterInstance` (e.g. the 16.3 `bfcacheId` addition) does not surface at
// `check-types` time. This factory is the single compile-time canary: its
// explicit `: AppRouterInstance` return-type annotation means a future required
// member addition fails `check-types` in exactly one place instead of silently
// passing 40+ mock sites.
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import { vi } from 'vitest'

/**
 * Build a fully-typed `AppRouterInstance` mock for tests. Every method is a
 * fresh `vi.fn()` unless overridden; `overrides` is spread last so a caller can
 * substitute a specific mock function (e.g. to assert on it) or a different
 * `bfcacheId` value.
 */
export function createMockRouter(overrides: Partial<AppRouterInstance> = {}): AppRouterInstance {
  return {
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    bfcacheId: 'mock-bfcache-id',
    ...overrides,
  }
}
