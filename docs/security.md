---
date: 2026-03-11
status: active
project: lmsplusv2
---

# Security Reference — LMS Plus v2

> Binding security rules for this project. Every developer and every Claude agent must follow this document.
> Violations found during review are blocking — they must be fixed before merge.

---

## 1. Threat Model

We are a multi-tenant SaaS serving regulated aviation training organisations (ATOs).
The highest-value targets are:

| Asset | Threat | Impact |
|-------|--------|--------|
| Exam question correct answers | Student reads answer before submitting | Exam integrity destroyed, regulatory breach |
| Cross-tenant data | ATO-A reads ATO-B's questions / student data | GDPR breach, loss of customer trust |
| Student PII (email, progress) | Unauthorised access or data leak | GDPR fine, reputational damage |
| Audit records (attendance, scores) | Deletion or tampering | Regulatory non-compliance, CAA audit failure |
| Service role key | Exposed in client bundle | Full database compromise |
| Exam session integrity | Answer replay or session reuse | Exam fraud |

---

## 2. Authentication & Sessions

### Magic Link Only (MVP)
- Supabase Auth handles token generation and expiry
- No passwords stored — phishing-resistant by default
- Magic link tokens expire after **1 hour** (configure in Supabase dashboard)
- **Production domain:** `https://lmsplus.app`
- **Allowed redirect URLs:** `https://lmsplus.app/auth/callback`, `http://localhost:3000/auth/callback`
- Auth redirect config lives in Supabase remote settings (Management API), NOT in `config.toml` (local dev only)

### Session Configuration (set in Supabase dashboard)
```
JWT expiry:           3600s (1 hour)
Refresh token reuse:  Disabled (rotation enabled)
Refresh token expiry: 7 days (sliding)
```

### Proxy Rule (Next.js 16)
Every route under `/app/*` must be protected by `apps/web/proxy.ts`.
Unauthenticated requests redirect to `/`. No exceptions.

```ts
// apps/web/proxy.ts — pattern required (Next.js 16 convention)
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // ... supabase session check
  if (!session && request.nextUrl.pathname.startsWith('/app')) {
    return NextResponse.redirect(new URL('/', request.url))
  }
}

export const config = {
  matcher: ['/app/:path*'],
}
```

---

## 3. Row Level Security (RLS)

**Rule: Every table must have RLS enabled with both USING and WITH CHECK policies.**

- `USING` — filters rows on SELECT, UPDATE, DELETE
- `WITH CHECK` — validates rows on INSERT, UPDATE
- Missing `WITH CHECK` means a student can INSERT data into another org's tables

### Required Policy Pattern

```sql
-- Enable RLS on every table (non-negotiable)
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;
ALTER TABLE table_name FORCE ROW LEVEL SECURITY;

-- Tenant isolation policy (apply to EVERY table)
CREATE POLICY "tenant_isolation" ON table_name
  USING (
    organization_id = (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id = (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );
```

### Role-Scoped Policies (where needed)

```sql
-- Students: own data only (mutable tables — allows all operations with condition)
CREATE POLICY "users_own_profile" ON users
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Instructors: read all student data within their org (no write)
CREATE POLICY "instructors_read_students" ON student_responses
  FOR SELECT
  USING (
    organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
    AND (SELECT role FROM users WHERE id = auth.uid()) IN ('instructor', 'admin')
  );

-- Immutable responses: scoped to SELECT + INSERT only, then blocked for UPDATE/DELETE
CREATE POLICY "students_read_responses" ON student_responses
  FOR SELECT
  USING (student_id = auth.uid());

CREATE POLICY "students_insert_responses" ON student_responses
  FOR INSERT
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "responses_no_update" ON student_responses
  FOR UPDATE USING (false);

CREATE POLICY "responses_no_delete" ON student_responses
  FOR DELETE USING (false);
```

### Immutable Tables: Policy Scope Pattern

Immutable tables (`student_responses`, `quiz_session_answers`, `audit_events`) must block UPDATE and DELETE. Write access varies by table:
- `student_responses` — INSERT allowed via RLS (`student_id = auth.uid()`)
- `quiz_session_answers` and `audit_events` — INSERT only via SECURITY DEFINER RPCs (e.g., `submit_quiz_answer()`), which bypass RLS. Direct INSERT blocked by restrictive RLS policies.

```sql
-- ✅ CORRECT — SELECT only; INSERT blocked
CREATE POLICY "students_read_answers" ON quiz_session_answers
  FOR SELECT
  USING (session_id IN (SELECT id FROM quiz_sessions WHERE student_id = auth.uid()));

-- Restrictive policies to block writes
CREATE POLICY "no_insert_answers" ON quiz_session_answers
  FOR INSERT WITH CHECK (false);

CREATE POLICY "no_update_answers" ON quiz_session_answers
  FOR UPDATE USING (false);

CREATE POLICY "no_delete_answers" ON quiz_session_answers
  FOR DELETE USING (false);

-- ❌ WRONG — This allows INSERT, which lets students forge is_correct values
CREATE POLICY "students_insert_answers" ON quiz_session_answers
  FOR INSERT
  WITH CHECK (session_id IN (SELECT id FROM quiz_sessions WHERE student_id = auth.uid()));
  -- ^ Removed in migration 006: students must not insert directly

-- ❌ WRONG — permissive policy without FOR clause applies to ALL operations (SELECT, INSERT, UPDATE, DELETE)
-- This overrides the restrictive no_update/no_delete because PostgreSQL OR's permissive policies
CREATE POLICY "students_own_answers" ON quiz_session_answers
  USING (session_id IN (SELECT id FROM quiz_sessions WHERE student_id = auth.uid()));
  -- ^ This applies to ALL operations, making INSERT/UPDATE/DELETE possible!
```

**Critical rule:** On immutable tables, block all direct writes:
- `FOR SELECT` — allow reads only
- `FOR INSERT WITH CHECK (false)` — block all inserts
- `FOR UPDATE USING (false)` — block all updates
- `FOR DELETE USING (false)` — block all deletes

Write operations go only through SECURITY DEFINER RPCs that enforce business logic.

### RLS Verification Checklist
Before any migration is merged, run:
```sql
-- Verify RLS is enabled
SELECT tablename, rowsecurity, forcerowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
-- Every row must show: rowsecurity = true, forcerowsecurity = true

-- Verify policies exist and have FOR clauses
SELECT tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
-- For immutable tables: every policy must have a specific cmd (SELECT, INSERT, UPDATE, DELETE)
-- Never a policy with cmd = NULL (that's ALL operations!)
```

---

## 4. Correct Answer Stripping (Critical)

**The `options` JSONB field contains `"correct": true/false`. This MUST NEVER reach a student's browser during an active session.**

### The Problem
```jsonc
// What's in the database — never send this to a student mid-quiz
{
  "options": [
    { "id": "a", "text": "Cumulus", "correct": false },
    { "id": "b", "text": "Nimbostratus", "correct": true },  // ← exposed!
    { "id": "c", "text": "Cirrus", "correct": false },
    { "id": "d", "text": "Altocumulus", "correct": false }
  ]
}
```

### The Fix: Server-Side RPC

All question serving for active sessions must go through a Postgres function that strips the `correct` field:

```sql
-- packages/db/migrations/xxx_quiz_functions.sql

CREATE OR REPLACE FUNCTION get_quiz_questions(p_question_ids uuid[])
RETURNS TABLE (
  id uuid,
  question_text text,
  options jsonb,          -- correct field removed
  subject text,
  topic text,
  subtopic text,
  difficulty text,
  image_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    q.id,
    q.question_text,
    -- Strip 'correct' from each option object
    jsonb_agg(
      jsonb_build_object(
        'id',   opt->>'id',
        'text', opt->>'text'
        -- 'correct' intentionally excluded
      )
      ORDER BY opt->>'id'
    ) AS options,
    q.subject,
    q.topic,
    q.subtopic,
    q.difficulty,
    q.image_url
  FROM questions q,
       jsonb_array_elements(q.options) AS opt
  WHERE q.id = ANY(p_question_ids)
    AND q.status = 'active'
  GROUP BY q.id;
END;
$$;
```

**Rule:** Any Server Action or API route that serves questions to students must use `get_quiz_questions()` — never a raw `SELECT * FROM questions`.

Correct answers are only fetched server-side when validating a submitted answer, never returned to the client.

---

## 5. Service Role Key

The service role key **bypasses RLS entirely**. It must never reach a browser.

| Key | Where it lives | Who can use it |
|-----|---------------|----------------|
| `SUPABASE_ANON_KEY` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` — safe in browser | Client-side Supabase queries (subject to RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only env var, never `NEXT_PUBLIC_` | Server Actions, migration scripts, import tool only |

```ts
// packages/db/src/admin.ts — server-only, never import in client components
import { createClient } from '@supabase/supabase-js'

if (typeof window !== 'undefined') {
  throw new Error('admin client must not be used in the browser')
}

export const adminClient = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!  // no NEXT_PUBLIC_ prefix
)
```

---

## 6. Security Headers

Configure in `apps/web/next.config.ts`:

```ts
const isDev = process.env.NODE_ENV !== 'production'
// Allow localhost connections in production builds that target local Supabase (E2E CI)
const isLocalSupabase = process.env.NEXT_PUBLIC_SUPABASE_URL?.startsWith('http://localhost')
const allowLocal = isDev || isLocalSupabase

const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control',    value: 'on' },
  { key: 'X-Frame-Options',           value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options',    value: 'nosniff' },
  { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',        value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // Development: allows unsafe-eval for Next.js HMR
      // Local Supabase: allows localhost connections (dev + E2E CI with local target)
      // Production (remote): blocks unsafe-eval and localhost, allows Supabase only
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob: https://*.supabase.co${allowLocal ? ' http://localhost:* http://127.0.0.1:*' : ''}`,
      "font-src 'self'",
      `connect-src 'self' https://*.supabase.co wss://*.supabase.co${allowLocal ? ' http://localhost:* http://127.0.0.1:* ws://localhost:*' : ''}`,
      "frame-ancestors 'none'",
    ].join('; '),
  },
]

export default {
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }]
  },
}
```

---

## 7. Input Validation

**Rule: Validate at every trust boundary. Trust nothing from the client.**

- All Server Actions must validate input with Zod before touching the database
- All API routes must validate request bodies with Zod
- Never use `as SomeType` to cast unvalidated external data

```ts
// Pattern for every Server Action
'use server'
import { z } from 'zod'

const SubmitAnswerSchema = z.object({
  questionId: z.string().uuid(),
  sessionId:  z.string().uuid(),
  selectedOptionId: z.enum(['a', 'b', 'c', 'd']),
})

export async function submitAnswer(raw: unknown) {
  const input = SubmitAnswerSchema.parse(raw)  // throws ZodError if invalid
  // ... proceed with validated input only
}
```

---

## 8. Secret Management

| Environment | Secret location |
|-------------|----------------|
| Local dev   | `apps/web/.env.local` (gitignored — see `.gitignore`) |
| Production  | Vercel Environment Variables (encrypted at rest) |
| CI/CD       | GitHub Actions secrets (never in workflow YAML) |

**`.gitignore` must always include:**
```
.env
.env.local
.env*.local
*.pem
*.key
```

**Pre-commit hook blocks:**
- Any file matching `*.env*` from being staged
- Any content matching `sk_live_`, `service_role`, `eyJ` (JWT prefix) patterns

---

## 9. Rate Limiting

Configure in Supabase dashboard (Auth → Rate Limits):

| Endpoint | Limit |
|----------|-------|
| Magic link send | 3 per hour per email |
| Token verification | 10 per hour per IP |

Proxy-level limiting (add to `apps/web/proxy.ts`):
```ts
// Use Vercel's built-in rate limiting or upstash/ratelimit for:
// - /api/* routes: 60 req/min per IP
// - /auth/* routes: 5 req/min per IP
```

---

## 10. Audit Log

Compliance requires attendance, progress test scores, and final exam results to be auditable by a CAA inspector.

### Audit Events Table

```sql
CREATE TABLE audit_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  actor_id        uuid NOT NULL REFERENCES users(id),
  actor_role      text NOT NULL,
  event_type      text NOT NULL,   -- see event types below
  resource_type   text NOT NULL,   -- 'quiz_session' | 'lesson_session' | 'user' etc.
  resource_id     uuid,
  metadata        jsonb,           -- event-specific data
  ip_address      inet,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Audit log is append-only: no UPDATE or DELETE ever
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_no_update" ON audit_events FOR UPDATE USING (false);
CREATE POLICY "audit_no_delete" ON audit_events FOR DELETE USING (false);
CREATE POLICY "audit_insert_own_org" ON audit_events
  FOR INSERT WITH CHECK (
    organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
  );
CREATE POLICY "audit_read_instructors" ON audit_events
  FOR SELECT USING (
    organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
    AND (SELECT role FROM users WHERE id = auth.uid()) IN ('instructor', 'admin')
  );
```

### Required Event Types

| Event | Trigger |
|-------|---------|
| `student.login` | Successful magic link verification |
| `quiz_session.started` | Student begins any quiz mode |
| `quiz_session.completed` | Student finishes session (score recorded) |
| `exam.started` | Mock exam begins |
| `exam.completed` | Mock exam ends (score + pass/fail recorded) |
| `question.created` | Instructor adds a question |
| `question.edited` | Instructor modifies a question |
| `question.deleted` | Instructor deletes a question |

---

## 11. Exam Session Integrity

Mock exam sessions are single-use. A `quiz_session` with `mode = 'mock_exam'` must enforce:

1. **Single activation** — once `started_at` is set, cannot be reset
2. **No answer changes** — `student_responses` is immutable (no UPDATE policy)
3. **Time enforcement** — exam end time is set server-side at `started_at + duration_minutes`. Server validates no answers accepted after this time.
4. **Question set locked** — question IDs are written to `quiz_sessions.config` at session start and cannot change mid-session

```sql
-- Enforce single-use exam sessions
CREATE POLICY "exam_sessions_no_restart" ON quiz_sessions
  FOR UPDATE USING (
    NOT (mode = 'mock_exam' AND started_at IS NOT NULL AND NEW.started_at IS DISTINCT FROM OLD.started_at)
  );
```

---

## 12. GDPR & Data Privacy

We store student PII: email address, full name, learning history, exam scores.

### Required Capabilities (build before first live student)
- **Data export:** instructor can export all data for a specific student (`/admin/students/:id/export`)
- **Data deletion:** instructor can delete a student's account and all associated data (`/admin/students/:id/delete`) — cascades on `users.id`
- **Retention policy:** student data retained for 3 years after last activity (EASA training record requirement), then auto-deleted via scheduled Supabase function

### Data Minimisation
- Do not store IP addresses in `student_responses` — only in `audit_events`
- Do not store device fingerprints
- `full_name` is optional — require only `email` at signup

---

## 13. Dependency Security

Add to Lefthook `pre-push` hook:

```yaml
# lefthook.yml
pre-push:
  commands:
    audit:
      run: pnpm audit --audit-level=high
      fail_text: "High severity vulnerabilities found. Run 'pnpm audit' to review."
```

Monthly: run `pnpm audit --fix` and review outdated packages with `pnpm outdated`.

---

## 14. Database Rules — Companion Document

All database design rules (soft delete, immutability, idempotency, RPC conventions, full schema SQL) live in `docs/database.md`. Key security-relevant rules from that document:

- No hard `DELETE` anywhere in application code — always `UPDATE SET deleted_at = now()`
- Immutable tables (`student_responses`, `quiz_session_answers`, `audit_events`) have RLS policies blocking UPDATE and DELETE
- `SECURITY DEFINER` RPCs must always include a manual `auth.uid()` check + `SET search_path = public`
- All multi-table mutations go through RPCs for atomicity — never multi-step application calls

## 15. What Supabase Handles For Us

These are covered by Supabase infrastructure — no additional work needed:

- TLS/HTTPS for all connections
- Encryption at rest (AES-256)
- Postgres connection pooling (PgBouncer)
- Auth token signing (HMAC-SHA256)
- Storage bucket access control
- Automatic backups (daily, 7-day retention on free tier)

---

*Last updated: 2026-03-11 | Owner: Claude (security-auditor agent reviews every push)*
