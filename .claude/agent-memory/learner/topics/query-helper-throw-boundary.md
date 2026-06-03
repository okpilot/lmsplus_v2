---
name: query-helper-throw-boundary
description: Server Action call sites must wrap now-throwing query helpers in try/catch to prevent app-shell crashes
metadata:
  type: feedback
---

# Query Helper Throw Safety at Server Action Boundaries

## The Pattern

Query helpers in `lib/queries/` throw on error — a safe convention for Server Component page-load contexts where `app/error.tsx` catches the throw and logs via Sentry.

When a query helper is promoted to throw-on-error (e.g., via a sweep of count≥2 violations), **any Server Action that returns that helper's output directly to client code must be updated to catch and handle the throw**.

## Why It Matters

**Server Component (safe):**
```tsx
// app/quiz/page.tsx
export default async function QuizPage() {
  const questions = await loadQuizQuestions(sessionId)  // throws on error
  // error thrown → app/error.tsx catches → logged to Sentry
  return <QuestionRenderer questions={questions} />
}
```

**Server Action without catch boundary (UNSAFE):**
```ts
// app/quiz/actions.ts
'use server'
export async function getQuizLookup(lookupId: string) {
  const data = await loadQuizLookup(lookupId)  // throws on error
  return { lookup: data }  // throw escapes the RPC boundary
}

// client calls the SA
const result = await getQuizLookup(id)  // uncaught throw crashes app shell
```

**Server Action with catch boundary (SAFE):**
```ts
// app/quiz/actions.ts
'use server'
export async function getQuizLookup(lookupId: string) {
  try {
    const data = await loadQuizLookup(lookupId)  // throws on error
    return { success: true, lookup: data }
  } catch (error) {
    console.error('[getQuizLookup] failed:', error)
    return { success: false, lookup: null }
  }
}

// client calls the SA
const result = await getQuizLookup(id)  // throw caught, returns typed error response
```

## When to Apply

Whenever a query helper is promoted to throw-on-error via a rule-promotion sweep:
1. Identify all Server Actions that call the helper.
2. Check if the SA returns the helper's output to the client.
3. If yes, wrap the call in try/catch (log server-side, return typed error).
4. If no (e.g., SA uses helper only for validation and returns a different shape), no boundary needed.

## Related Patterns

- **Query-file auth helpers:** Must destructure `{ error }` and log before guard decisions (DISTINCT from throw-posture). Auth path errors should not throw.
- **Server Component helpers:** Throw-on-error is the correct pattern; app/error.xyz catches.
- **Red-team specs:** Any spec exercising a now-throwing helper via a Server Action must verify error handling (call without args, verify the SA returns an error response, not a 500).

## First Occurrence

Commit c26ef61f (#627 sweep): `lookup.ts` Server Action returned `loadQuizLookup()` results directly to client. Semantic-reviewer ISSUE: throw crossed the boundary and crashed app.tsx on error. Fix: wrapped call in try/catch, returned typed error response.

---

*Added 2026-06-01 after #627 rule promotion uncovered Server Action boundary gap.*
