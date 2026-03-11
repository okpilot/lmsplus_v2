# Next.js App Router Patterns — LMS Plus v2

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
`middleware.ts` at root of `apps/web/` — protects `/app/*` routes.
