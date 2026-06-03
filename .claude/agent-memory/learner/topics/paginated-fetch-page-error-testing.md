---
name: paginated-fetch-page-error-testing
description: Two valid forms for testing paginated-fetch caller-level page-error paths
metadata:
  type: reference
  promoted: 2026-06-01 (PR #699)
---

# Paginated-Fetch Caller-Level Page-Error Testing

When a paginated query (e.g., `fetchAllRows(page, limit)`) can return a page-error object, the **caller** of that fetch must test recovery on error, not just the happy path.

**Rule:** `code-style.md §7` (promoted 2026-06-01 from count=2).

## Two Valid Test Forms

### Form 1: Real Helper + Mocked Queries
The helper is real; `supabase.from().select()` calls are mocked.

**Structure:**
```ts
// auth.test.ts
import { fetchUsersByOrg } from './auth'
import { mockSupabaseAuth } from './__mocks__/supabase'

it('retries on page error from fetch', async () => {
  const mockSelect = vi.fn()
  mockSelect
    .mockResolvedValueOnce({ error: { message: 'page error', code: 'PGRST116' } })
    .mockResolvedValueOnce({ data: [{ id: '1', email: 'a@example.com' }] })

  vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any)

  const result = await fetchUsersByOrg(orgId)
  expect(result).toEqual([{ id: '1', email: 'a@example.com' }])
  expect(mockSelect).toHaveBeenCalledTimes(2)
})
```

**When to use:** The helper itself is multi-step (multiple RPC calls, branching logic, orchestration) and retry logic is part of the helper. The mock focus is on the Supabase layer.

### Form 2: Helper Mocked as Dependency
For pure pass-through callers (Server Actions), the helper itself is mocked.

**Structure:**
```ts
// actions.test.ts
import { loadUsersCsv } from './actions'
import * as authLib from '@/lib/auth'

it('reports error to user when fetch fails', async () => {
  vi.spyOn(authLib, 'fetchUsersByOrg').mockRejectedValueOnce(
    new Error('page error: max_rows exceeded')
  )

  const result = await loadUsersCsv({ orgId: 'org1' })
  expect(result).toEqual({
    success: false,
    error: 'Failed to load users. Please try a smaller date range.'
  })
})
```

**When to use:** The caller is a Server Action or other orchestrator that consumes the helper. The helper's error behavior is already tested in its own test file. The caller's test focuses on its error-path response to the user.

## Key Insight

Both forms satisfy the rule: the **caller** is tested on error, not just success. Form 1 re-tests the helper's retry logic in the caller context. Form 2 mocks the helper to test the caller's error-handling response. Neither is "better"—pick the form that isolates what the caller does.

## Sweep Reference (PR #699)

All 7 `fetchUser*` callers in `app/app/gdpr/actions.ts` covered:
- `fetchUserEmail` (Form 2 mock)
- `fetchUserResponses` (Form 2 mock)
- `fetchUserSessions` (Form 2 mock)
- `fetchUserAuditLog` (Form 2 mock)
- `fetchUserConsentState` (Form 1 real helper)
- `fetchUserQuizzes` (Form 1 real helper)
- `fetchUserFlags` (Form 1 real helper)

Both forms passed semantic-reviewer and test-writer.
