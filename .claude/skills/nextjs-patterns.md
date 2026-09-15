# Next.js App Router Patterns — LMS Plus v2

> **RULE 0 — NO PROSE.** State what is true; delete the rest. No justification, no precedent, no archaeology — that is what `git log` is for. Every sentence is a claim that can be false, so fewer sentences means fewer defects. If a fact is derivable, ship the command, not the paragraph. Evidence is not prose: a skip reason, an `EVIDENCE:` line, a finding's stated basis or a required status/summary stays wherever a rule asks for it.

## Data fetching
Always fetch in Server Components. Never useEffect for data.

```tsx
// ✅ Server Component (default)
export default async function DashboardPage() {
  const data = await fetchFromDB() // direct DB call, server-side
  return <ClientComponent data={data} />
}
```

## Server Actions
All mutations go through Server Actions. No API routes for mutations.

```typescript
'use server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'

const Schema = z.object({ questionId: z.string().uuid() })

export async function submitAnswer(input: unknown) {
  const { questionId } = Schema.parse(input)
  const student = await requireAuth() // throws if not authed
  // ... mutation logic
}
```

## use client boundary
Push `'use client'` as deep as possible. Default to Server Components.

## Route structure
```
app/
  (auth)/
    login/page.tsx
    auth/callback/route.ts
  app/
    dashboard/page.tsx
    quiz/
      page.tsx          ← config
      session/page.tsx  ← active session (client)
```

## Middleware
`proxy.ts` at root of `apps/web/` — protects `/app/*` routes (renamed from middleware.ts — project convention, not a Next.js requirement).
