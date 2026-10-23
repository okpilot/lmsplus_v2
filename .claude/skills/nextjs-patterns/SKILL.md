---
name: nextjs-patterns
description: Next.js App Router patterns for this repo — data fetching, Server Actions, Route Handlers, client boundaries. Load when writing or reviewing apps/web code.
---

# Next.js App Router Patterns — LMS Plus v2

> **RULE 0 — NO PROSE.** State what is true; delete the rest. No justification, no precedent, no archaeology — that is what `git log` is for. Every sentence is a claim that can be false, so fewer sentences means fewer defects. If a fact is derivable, ship the command, not the paragraph. Evidence is not prose: a skip reason, an `EVIDENCE:` line, a finding's stated basis or a required status/summary stays wherever a rule asks for it.

## Data fetching
R1: server-initiated reads happen in Server Components.
R2: client-initiated reads (after render, interaction, focus, polling) go through a GET Route Handler per `docs/security.md` § Route Handler reads; never a Server Action.
R4: no `useEffect` data fetching; effects are for hydration guards and external-system sync.
R6: before adding a cache, TTL, timeout, retry or module-level store, cite in the PR body the Next/React/Supabase doc page that lacks the behaviour.

```tsx
// ✅ Server Component (default)
export default async function DashboardPage() {
  const data = await fetchFromDB() // direct DB call, server-side
  return <ClientComponent data={data} />
}
```

## Server Actions
R3: mutations are Server Actions only.
R5: NEVER create a Route Handler that mutates (webhooks and auth callbacks are the existing exceptions).

```typescript
'use server'
import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'
import { verifySessionUser } from '@/lib/auth/verify-session-user'

const Schema = z.object({ questionId: z.string().uuid() })

export async function submitAnswer(input: unknown) {
  const { questionId } = Schema.parse(input)
  const supabase = await createServerSupabaseClient()
  const student = await verifySessionUser(supabase)
  if (!student) return { success: false, error: 'Not authenticated' }
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
