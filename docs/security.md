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

### Email + Password Auth

- Supabase Auth handles password hashing, session tokens, and expiry
- Login via `signInWithPassword({ email, password })` → `/auth/login-complete` (server hop) → `record_login()` RPC (audit event) → `/app/dashboard`
- Forgot password via `resetPasswordForEmail()` → recovery email with PKCE token → `/auth/confirm` (verifyOtp server-side) → `/auth/reset-password`
- Recovery defense-in-depth: `/auth/callback` also supports `?next=/auth/reset-password` with allowlist validation (blocks open-redirect, protocol-relative URLs, malformed URLs)
- Password minimum length: 6 characters (enforced by Zod on client, Supabase on server)
- **Production domain:** `https://lmsplus.app`
- **Allowed redirect URLs:** `https://lmsplus.app/auth/callback`, `https://lmsplus.app/auth/confirm`, `http://localhost:3000/auth/callback`, `http://localhost:3000/auth/confirm`
- Auth redirect config lives in Supabase remote settings (Management API), NOT in `config.toml` (local dev only)

### Auth Callback Guard Ordering

When adding or modifying any branch in `apps/web/app/auth/callback/route.ts`, verify the full guard ordering before committing:
1. All existence/registration checks (`getUser()`, `public.users` lookup) must execute **before** any branch-specific redirect.
2. Any branch that fails after a session is established must call `signOut()` before redirecting.

This rule exists because guard ordering errors have occurred twice (commits 83ae098, 5cc4109) — new branches were inserted above the profile gate, allowing orphaned auth users to bypass the `not_registered` check.

### Session Configuration (set in Supabase dashboard)

```text
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

### Admin Route Protection (defense in depth)

Admin routes (`/app/admin/*`) require two independent guards — both must pass.

**Layer 1 — Proxy guard (`apps/web/proxy.ts`):**
Checks `users.role = 'admin'` for any request matching `/app/admin/*`. Returns 403 if the authenticated user is not an admin. This blocks the request before it reaches any Server Component or Server Action.

**Layer 2 — Server Action guard (`apps/web/lib/auth/require-admin.ts`):**
`requireAdmin()` verifies both auth (non-null session) and admin role. Called at the top of every admin Server Action before any data access. If either check fails, it throws — the action never proceeds.

**Why both:** The proxy guard prevents UI rendering for non-admins. The Server Action guard ensures admin actions are self-defending even if the proxy is misconfigured or bypassed (e.g., direct API calls). Neither layer trusts the other.

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
-- Users table: SELECT only. No UPDATE policy exists by design.
-- RLS controls rows, not columns — a blanket UPDATE policy would let
-- students change their own role/organization_id (privilege escalation).
-- If profile editing is needed, use a SECURITY DEFINER RPC that accepts
-- only safe fields (full_name, avatar_url, etc.).
-- Defense-in-depth layer 1 (mig 041): trg_protect_users_sensitive_columns blocks role/org/deleted_at
--   changes for non-service-role connections even if an UPDATE policy is added.
-- Defense-in-depth layer 2 (mig 090, #773): authenticated role holds UPDATE (full_name) only —
--   REVOKE UPDATE ON users FROM authenticated + GRANT UPDATE (full_name) TO authenticated.
--   A direct UPDATE users SET role='admin' returns 42501 before the trigger or RLS fires.
CREATE POLICY "users_select" ON users
  FOR SELECT
  USING (id = auth.uid() AND deleted_at IS NULL);

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

### Red-Team Testing
After schema or Server Action changes, verify RLS actually enforces tenant isolation:
```bash
pnpm --filter @repo/web e2e:redteam
```

This runs a suite of adversarial tests that exploit cross-tenant access, RLS bypass, session forgery, and other attack vectors. If a test fails, the defense doesn't hold — treat as blocking.

### Multiple Permissive SELECT Policies — RPCs Must Scope Explicitly

PostgreSQL combines multiple **permissive** RLS policies with **OR**. When a table carries more than one permissive `SELECT` policy — typically a narrow per-user policy plus a broader role policy — RLS alone does **not** restrict a read to the calling user. A `SECURITY INVOKER` or `SECURITY DEFINER` function meant to return the **caller's own** rows from such a table MUST add an explicit predicate (`WHERE <owner_col> = auth.uid()`, or an `auth.uid() = p_student_id` identity guard). The explicit filter is load-bearing, not redundant.

**Why:** `student_responses` has both `students_read_responses` (`student_id = auth.uid()`) and `instructors_read_students` (org + role in instructor/admin). `get_student_mastery_stats` (SECURITY INVOKER) aggregated it relying on RLS, so an instructor/admin caller received **every** student's counts instead of their own (#540 / red-team BW3). Fix: explicit `WHERE sr.student_id = auth.uid()` in the numerator CTE.

**Tables with multiple permissive SELECT policies** (audit when adding an RPC that reads one): `student_responses`, `quiz_sessions`, `exam_configs`, `audit_events`.

**Migration discipline:** when porting a client-side Supabase query to an RPC, replicate the old query's explicit ownership filters (`.eq('student_id', userId)`) in SQL — do not assume RLS subsumes them. Admin/org-wide RPCs behind an `is_admin()` gate are intentionally broad and exempt.

Verified repo-wide at promotion (2026-05-26): the only offender was `get_student_mastery_stats` (fixed); all other per-caller readers (`get_daily_activity`, `get_subject_scores`, `list_my_*`, report RPCs) already carry explicit `auth.uid()` scoping.

---

## 4. Correct Answer Stripping (Critical)

**Multiple-choice answer keys are now stored in the `correct_option_id` column (mig 111, #823), not in the `options` JSONB. The `options` field stores only `{id, text}` — the `correct` key is stripped on every write by a trigger. This MUST NEVER reach a student's browser during an active session.**

### The Problem (Pre-Mig-109)
```jsonc
// OLD: stored in JSONB (mig 094 and earlier)
{
  "options": [
    { "id": "a", "text": "Cumulus", "correct": false },
    { "id": "b", "text": "Nimbostratus", "correct": true },  // ← exposed if leaked!
    { "id": "c", "text": "Cirrus", "correct": false },
    { "id": "d", "text": "Altocumulus", "correct": false }
  ]
}
```

### The Fix (Post-Mig-109): Dedicated Column + Trigger
```jsonc
// NEW: stored in dedicated column (mig 111)
{
  "correct_option_id": "b",  // ← privilege-layer REVOKE-gated
  "options": [
    { "id": "a", "text": "Cumulus" },
    { "id": "b", "text": "Nimbostratus" },
    { "id": "c", "text": "Cirrus" },
    { "id": "d", "text": "Altocumulus" }
  ]
}
```

The `correct_option_id` column is **protected by two layers:**
1. **Privilege layer (mig 111):** `REVOKE SELECT (correct_option_id) ON questions FROM authenticated` — direct PostgREST reads return 42501.
2. **Trigger (mig 111):** `trg_sanitize_question_options` strips any stray `correct` key on every write (defense-in-depth for raw SQL/PostgREST writes that bypass the app layer).

### The Fix: Server-Side RPC

All question serving for active sessions must go through a Postgres function that strips the `correct` field:

```sql
-- packages/db/migrations/002_rpc_functions.sql (source of truth)

CREATE OR REPLACE FUNCTION get_quiz_questions(p_question_ids uuid[])
RETURNS TABLE (
  id uuid, question_text text, question_image_url text,
  options jsonb,          -- 'correct' field stripped
  subject_code text, topic_name text, subtopic_name text,
  lo_reference text, difficulty text,
  explanation_text text, explanation_image_url text,
  question_number text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  SELECT q.id, q.question_text, q.question_image_url,
    jsonb_agg(
      jsonb_build_object('id', opt->>'id', 'text', opt->>'text')
      -- 'correct' intentionally excluded
      ORDER BY random()
    ) AS options,
    s.code, t.name, st.name, q.lo_reference, q.difficulty,
    q.explanation_text, q.explanation_image_url, q.question_number
  FROM questions q
  JOIN easa_subjects s ON s.id = q.subject_id
  JOIN easa_topics t ON t.id = q.topic_id
  LEFT JOIN easa_subtopics st ON st.id = q.subtopic_id,
  LATERAL jsonb_array_elements(q.options) AS opt
  WHERE q.id = ANY(p_question_ids)
    AND q.deleted_at IS NULL
    AND q.status = 'active'
  GROUP BY q.id, q.question_text, q.question_image_url,
           s.code, t.name, st.name, q.lo_reference, q.difficulty,
           q.explanation_text, q.explanation_image_url, q.question_number;
END;
$$;
```

**Randomization:** Options are returned in random order via `ORDER BY random()`. This prevents students from memorising positional patterns. Each call produces an independent random arrangement.

**Rule:** Any Server Action or API route that serves questions **during an active session** must use `get_quiz_questions()` — never a raw `SELECT * FROM questions`.

Correct answers are only fetched server-side when validating a submitted answer, never returned to the client during an active session.

**dialog_fill answer-key strip (mig 105/118; hardened mig 125-127, #951):** For `dialog_fill` questions the student-facing `dialog_template` carries `{{n|canonical;syn1;syn2}}` tokens; the serving RPCs (`get_quiz_questions`, `get_vfr_rt_exam_questions`) rewrite each token to a plain `{{n}}` marker via `regexp_replace` so canonicals/synonyms never reach the student (`blanks_safe` is emitted index-only). The token delimiters `{ } | ;` are structural and a value cannot represent them, so an unescaped `}` in a value used to terminate the strip early and leak a partial key. Two layers close this (#951): (1) the **mig-125 `questions_dialog_fill_template_wellformed` CHECK** rejects, at INSERT, any dialog_fill row whose template tokens contain a stray `}`/`|` — the primary leak guard; and (2) the **strip regex is delimiter-hardened** (mig 126/127, value class `(?:[^}]|\}(?!\}))*` anchors on `}}`) as in-RPC defense-in-depth. The CHECK is a superset of the hardened strip's residue, so the two are co-dependent — do not weaken either independently.

### Post-Session Exception: Report RPCs (Mig 109, #823)

Post-session report queries may read the `correct_option_id` from questions server-side, provided:

1. The query verifies the session is **completed** (`ended_at IS NOT NULL` — student has already answered all questions)
2. The correct option ID is returned only as a scalar (`a`, `b`, `c`, or `d`) — never as a boolean or nested in options
3. The query runs in a **Server Component** (data never hits the client as raw DB rows)

**Implementation:** Use `get_report_correct_options()` (mig 114) or `get_vfr_rt_exam_results()` (mig 115) RPCs to fetch correct option IDs. These RPCs:
- Require `ended_at IS NOT NULL` or `session already ended` checks before reading the key
- Return the option ID only (not the full row with the column exposed)
- Run as `SECURITY DEFINER` (postgres owner), which bypasses the privilege-layer REVOKE
- Enforce student/owner scoping in SQL so the caller cannot read another student's answers

**Why it's safe:** The privilege layer (`REVOKE SELECT (correct_option_id)`) prevents accidental exposure via direct PostgREST reads (42501 on `.select('correct_option_id')`). The RPC-only path means the answer key reaches the client **only after the session ends**, when feedback is intended. Direct `SELECT *` from `questions` never returns `correct_option_id` anyway — it's not in the `authenticated` role's granted columns.

This is intentional feedback — showing which answer was correct after the student has answered is the core learning loop, not a data leak.

### Study Mode Exception: On-Demand Answer Keys (Mig 135)

> **UI label:** this feature is surfaced as **Discovery** (first/default segment of the New Quiz `ModeToggle`). The RPC name, action name, and all internal identifiers remain `study`/`get_study_questions`/`startStudy`.

Study Mode is a **self-paced MC flashcard practice surface** where students request questions on-demand and are shown the correct answer immediately, with no score. (Since #1011 — see §11d — the discovery-backed Study flow runs on a **real ephemeral `mode='discovery'` `quiz_sessions` row** via `start_discovery_session` (mig 137); it stays non-resumable and nothing-scored, but it is no longer fully session-less. This lets the single-active-session invariant block Discovery from coexisting with a live exam on the shared MC pool.) The `get_study_questions(p_question_ids uuid[])` RPC (mig 135, feat/study-mode-mc) returns MC questions WITH `correct_option_id` and `explanation_text` directly in the response payload. This is **DELIBERATE answer-key exposure** — the feature is explicitly designed around immediate feedback, equivalent to the post-session report loop but triggered on-demand instead of after completion.

**Exam-integrity is NOT automatic here** — it is enforced by the active-exam-session guard (item 6 below). Mock, internal, and VFR-RT exams grade from the **same org MC pool**, and the exam runner legitimately hands the client each question's `id` (`get_quiz_questions` / `get_vfr_rt_exam_questions` return `q.id`). Without a guard, a student mid-exam could POST those IDs straight to this RPC and read the answer keys — a mid-exam answer oracle that would nullify the practice-only guard in `check_quiz_answer` (mig 117). The guard closes that hole.

**Guard set (mirrors session-bound query paths):**
1. Auth check + active-caller gate (security.md rules 7 + 12)
2. Tenant-scope filter — resolves the caller's org in one deleted_at-filtered read (rejects a soft-deleted caller AND scopes the question pool so a foreign-org ID cannot leak)
3. Soft-delete + status filters — `q.deleted_at IS NULL AND q.status = 'active'` (required; see note below)
4. Type filter — `q.question_type = 'multiple_choice'`
5. Options returned in **stored order** (no shuffle — the answer is visible anyway)
6. **Mid-exam answer-oracle guard** — `RAISE 'active_exam_session'` when the caller has any active session (`ended_at IS NULL AND deleted_at IS NULL`) in an exam mode (`mock_exam`, `internal_exam`, `vfr_rt_exam`). This is the server-side enforcement of the single-active-session rule: Study Mode (which reveals keys) is unavailable while an exam is live. Implemented **deny-by-default** (`mode NOT IN ('smart_review','quick_quiz','discovery')`, the two practice modes + the caller's own discovery row) rather than a positive exam whitelist — so a future exam-like mode added to the `quiz_sessions.mode` CHECK is blocked automatically (fail-closed), matching `check_quiz_answer`'s negative mode guard. Practice modes (`smart_review`, `quick_quiz`) are excluded because they already reveal answers via `check_quiz_answer`, so blocking them adds no protection. The caller's own `discovery` session (mig 142, #1011) is excluded for a different reason: Discovery reveals answers via *this* RPC (`get_study_questions`), so a student's own active discovery row must not self-trip the guard and break Study Mode. The UI also gates this, but the RPC must self-defend because it is `GRANT EXECUTE TO authenticated` and reachable directly. Red-team coverage: Vector EO6. **Structural complement:** §11d (single-active-session invariant, #1011) makes an answer-revealing session unable to *coexist* with a graded exam at all — you cannot start the second session — so this read-time guard and the start-time invariant defend the oracle from both ends.

**§15 carve-out does NOT apply.** Report and in-flight RPCs omit the `deleted_at` filter because they read questions via an immutable, write-once boundary (§15 — `quiz_session_answers.question_id` for report RPCs, the frozen `quiz_sessions.config.question_ids` for in-flight RPCs). Study Mode reads by **arbitrary caller-supplied `p_question_ids`**, so the soft-delete filter and `status='active'` guard are **REQUIRED** — a caller must not be able to surface a soft-deleted or retired question's answer key.

**Why it's safe:** The privilege layer (`REVOKE SELECT (correct_option_id)`) still prevents accidental exposure via direct PostgREST reads (42501). The RPC is the *intended* path for answer keys in this context. The active-exam-session guard (item 6) ensures the keys can never be read while a graded exam is in progress, so the immediate-feedback design has no exam-integrity impact. Outside an exam, students requesting questions they already know the answer to is the intended behavior — not a failure mode.

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
  { key: 'X-Frame-Options',           value: 'DENY' },
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

**Edge Middleware responses (3xx redirects, 4xx Forbidden, 5xx errors).** Next.js `headers()` only applies to routed responses; middleware-emitted responses bypass it. `apps/web/proxy.ts` re-emits the 6 static headers on every middleware response and applies a **reduced CSP** of `default-src 'none'; frame-ancestors 'none'` (not the full routed-response CSP). The reduction is intentional: no scripts execute on a 3xx/4xx/5xx, so locking `default-src` to `'none'` is at least as strict as the routed policy and prevents accidental subresource loading on error pages. `frame-ancestors 'none'` matches the routed CSP so legacy browsers ignoring `default-src` still see the framing deny intent. The red-team spec `apps/web/e2e/redteam/header-validation.spec.ts` asserts both response classes; do not assume routed-response CSP rules apply to middleware responses when reviewing security changes.

---

## 7. Input Validation

**Rule: Validate at every trust boundary. Trust nothing from the client.**

- All Server Actions must validate input with Zod before touching the database. Use `safeParse()` or wrap `.parse()` in try/catch — bare `.parse()` throws a `ZodError` that escapes the typed return contract.
- All API routes must validate request bodies with Zod
- Never use `as SomeType` to cast unvalidated external data
- Escape `%` and `_` wildcards before interpolating user input into `.ilike()` / `.like()` calls — use an `escapeLike()` helper. This is not SQL injection (PostgREST parameterizes), but it prevents users from broadening query scope via wildcard characters.
- **`start_quiz_session.p_question_ids` array cap** — `start_quiz_session` enforces a 500-element cap at the DB layer (`too_many_questions`, mig 086 / #275). The Server Action Zod schema enforces the same cap so a direct RPC caller cannot bypass it to mount a resource-exhaustion attack.

```ts
// Pattern for every Server Action
'use server'
import { z } from 'zod'

const SubmitAnswerSchema = z.object({
  questionId: z.uuid(),
  sessionId:  z.uuid(),
  selectedOptionId: z.enum(['a', 'b', 'c', 'd']),
})

export async function submitAnswer(raw: unknown) {
  const parsed = SubmitAnswerSchema.safeParse(raw)
  if (!parsed.success) return { success: false, error: 'Invalid input' }
  // ... proceed with parsed.data only
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
| Sign-in attempts | 30 per hour per IP |
| Password reset | 3 per hour per email |
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
-- Block all direct client INSERTs. Only SECURITY DEFINER RPCs can write audit events.
CREATE POLICY "audit_no_direct_insert" ON audit_events
  FOR INSERT WITH CHECK (false);
CREATE POLICY "audit_read_instructors" ON audit_events
  FOR SELECT USING (
    organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
    AND (SELECT role FROM users WHERE id = auth.uid()) IN ('instructor', 'admin')
  );
```

### Required Event Types

| Event | Trigger |
|-------|---------|
| `student.login` | Successful email + password sign-in (via `record_login()` RPC, 60s rate-limited) |
| `user.password_changed` | Student changes their own password (via `changePassword` Server Action, recorded by `record_auth_event()` RPC) |
| `user.password_reset` | Admin resets a student password (via `resetStudentPassword` Server Action, recorded by `record_auth_event()` RPC) |
| `user.deactivated` | Admin deactivates a student account (via `toggleStudentStatus` deactivate path, recorded by `record_auth_event()` RPC) |
| `user.created` | Admin creates a new student account (via `createStudent` Server Action, recorded by `record_auth_event()` RPC) |
| `quiz_session.started` | Student begins any quiz mode |
| `quiz_session.completed` | Student finishes session (score recorded) |
| `exam.started` | Mock exam begins |
| `exam.completed` | Mock exam ends (score + pass/fail recorded) |
| `exam.expired` | Mock exam past deadline auto-completed (Layer 1) |
| `internal_exam.code_issued` | Admin issues an `internal_exam_codes` row |
| `internal_exam.started` | Student consumes a code; new `internal_exam` session created |
| `internal_exam.completed` | Internal-exam session submitted (score + pass/fail recorded) |
| `internal_exam.expired` | Internal-exam session ended past deadline (Layer 1) or via admin void of an active session |
| `internal_exam.code_voided` | Admin voids a code (always written; on active-void, paired with `internal_exam.expired` for the session) |
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
-- Enforce single-use exam sessions (via trigger, not RLS — NEW/OLD are trigger-only)
CREATE OR REPLACE FUNCTION prevent_exam_restart()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.mode = 'mock_exam' AND OLD.started_at IS NOT NULL
     AND NEW.started_at IS DISTINCT FROM OLD.started_at THEN
    RAISE EXCEPTION 'Cannot restart a mock exam session';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_exam_no_restart
  BEFORE UPDATE ON quiz_sessions
  FOR EACH ROW EXECUTE FUNCTION prevent_exam_restart();
```

---

## 11a. Server Action Session Ownership

Any Server Action that operates on a quiz session or its questions must verify **both** ownership and membership before proceeding — RLS alone is not sufficient because Server Actions run with the user's session token but accept arbitrary input.

**Required checks (in order):**
1. `quiz_sessions.student_id = auth.uid()` — session belongs to the authenticated user
2. `quiz_sessions.ended_at IS NULL` — session is still active
3. `quiz_sessions.deleted_at IS NULL` — session is not discarded
4. `questionId IN session.config.question_ids` — question belongs to this session

**Enforced in:** `checkAnswer`, `fetchExplanation` (commit 306f44a, 2026-03-13). The `batch_submit_quiz` RPC enforces the same four checks at the SQL layer.

**Runtime guard:** When reading `config.question_ids` from the DB, use `Array.isArray()` before `.includes()` — the `as unknown as` TypeScript cast provides no runtime guarantee against malformed JSONB.

---

## 11b. Internal Exam Mode

`mode = 'internal_exam'` reuses the mock-exam integrity rules above (single activation, immutable responses, server-side deadline, locked question set) and adds:

- **Code-gated entry.** Sessions can only start via `start_internal_exam_session(p_code)`. The RPC validates `code_not_yours`, `code_voided`, `code_already_used`, `code_expired`, and consumes the code with a race-safe `WHERE consumed_at IS NULL` clause. There is no client-side path that bypasses code validation.
- **Single-use codes.** `internal_exam_codes` has no INSERT, UPDATE, or DELETE RLS policy for the authenticated role — writes happen only via SECURITY DEFINER RPCs (`issue_internal_exam_code`, `start_internal_exam_session`, `void_internal_exam_code`). FORCE ROW LEVEL SECURITY (migration `20260429000009`) prevents the table-owner role from bypassing RLS even on direct PostgREST writes. Migration `20260521000004` additionally `REVOKE UPDATE ON internal_exam_codes FROM authenticated` for defense-in-depth at the GRANT layer.
- **Plaintext code storage.** Codes are stored unhashed because the active-code window is short (24h, single-use) and admins must be able to re-display a code they just issued. Codes are never returned to students through any read-path query — students fetch their active codes via the `list_my_active_internal_exam_codes()` SECURITY DEFINER RPC, which omits the `code` column from its return signature. The student SELECT RLS policy was dropped in migration `20260521000004` (closes #577), so direct PostgREST reads on `internal_exam_codes` now return 0 rows for the authenticated role; the RPC is the only sanctioned read path. The student "Available" tab lists active codes by subject + expiry only, never the code value.
- **Admin void = forced fail.** Voiding a consumed code with an active session forces `passed = false` and computes the score from existing answers (unanswered = wrong). The RPC refuses to retroactively change a session whose `ended_at` is already set (`cannot_void_finished_attempt`).
- **No discard.** Server Action `discardSession` rejects `mode = 'internal_exam'`. The student-side discard button is hidden by mode in the session header. Internal-exam attempts are auditable artefacts and cannot be removed by the student.
- **No flag during internal exam.** Server Action `toggleFlag` rejects flagging when the caller has an active `internal_exam` session (`ended_at IS NULL AND deleted_at IS NULL`) — derived server-side from the caller's own session, so it holds against a direct call. The runner flag button is hidden by mode, and the internal-exam report drops the flag UI entirely (no `ReportFlagProvider`), so there is no post-exam flag path on that report either. Because the guard is global-per-student (it looks for *any* live internal_exam session, not a specific question), while an internal exam is live *all* flag toggles are rejected — including from a past practice-report tab reachable by URL — a benign, security-positive consequence (the `cannot_flag_internal_exam` sentinel is never surfaced to the user; the client swallows it). Outside a live internal exam, mock-exam and practice flagging are unchanged.
- **Admin-only issue/void.** `issue_internal_exam_code` and `void_internal_exam_code` both gate via `is_admin()` AND org-scope. `start_internal_exam_session` requires `code.student_id = auth.uid()` — students cannot redeem another student's code.

### Known residual exam-mode vectors (red-team AJ: document-only / AL: constraint-enforced)

These two **LOW-severity** vectors from the exam-mode red-team review (issue #517) are bounded away from the high-value student-facing threats in §1, so neither has a dedicated automated red-team test yet. They differ in current enforcement state: **AJ** is document-only (an admin-only action inside the admin's own org — a trusted boundary, not student-reachable, no answer exposure or privilege escalation), while **AL**'s data-integrity invariant is already enforced by a DB-level partial unique index — only a cosmetic error-message refinement remains. The residual hardening for each is tracked (AJ → #755, AL → #754); the entries below record the current state and the concrete refinement each issue will apply.

- **AJ — Admin can reactivate a soft-deleted config outside `upsert_exam_config`, bypassing its controlled de-duplication path. ENFORCED (mig 089, #755).** `exam_configs` enforces one active config per (org, subject) via the partial unique index `uq_exam_configs_org_subject_active … WHERE deleted_at IS NULL` (migration `20260411000007`). An admin who directly `UPDATE`s a soft-deleted config to clear `deleted_at` — instead of going through `upsert_exam_config` — reactivates it without the RPC's soft-delete-aware lookup and conditional insert/update branch. The partial unique index still applies to that UPDATE, so a *second* concurrently-active config for the same (org, subject) is **rejected with `23505`** — the data-integrity invariant (≤1 active config per org+subject) holds at the DB layer. What the bypass skips is only the RPC's controlled reactivation flow, **not** the uniqueness guarantee. **Severity LOW:** admin-only within the admin's own org, unreachable by students; worst case is an uncontrolled reactivation, not duplicate configs or a security-boundary breach. **Hardening applied in mig 089 (#755):** trigger `trg_block_exam_config_reactivation` raises `'exam_config reactivation must go through upsert_exam_config'` when `OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL` (unconditional — no role exemption). Direct reactivation attempts now fail at the DB layer. `upsert_exam_config` is unaffected because its UPDATE branch never writes `deleted_at` (it would INSERT a fresh row rather than clear the flag), so the trigger's reactivation condition is never met on the sanctioned path.
- **AL — Concurrent duplicate `start_exam_session` race is constraint-enforced; error mapping now applied. ENFORCED (mig 088, #754).** `start_exam_session` checks for an existing active session with an `IF EXISTS … RAISE` guard (migration `20260411000005`, persisted in the latest definition `20260428000004`) before inserting. Defense-in-depth backs this with the partial unique index `uq_active_exam_session` on `quiz_sessions`, now on `(student_id, organization_id, subject_id) WHERE mode = 'mock_exam' AND ended_at IS NULL AND deleted_at IS NULL` (index column list widened in mig 088 to include `organization_id`, aligning with `uq_internal_exam_session_active`). Two concurrent active mock sessions for the same (student, org, subject) are **impossible** at the DB layer. **Hardening applied in mig 088 (#754):** the RPC now catches `unique_violation` (`23505`) from the index and maps it to the friendly domain error `'an exam session is already in progress for this subject'`; callers receive a consistent message regardless of whether they hit the sequential EXISTS check or the concurrent index rejection. The TOCTOU window is now fully closed at both the application-logic and error-surface layers.

### `is_admin()` soft-delete fix (migration `20260429000001`)

`public.is_admin()` was missing `AND deleted_at IS NULL` on the `users` lookup. A soft-deleted admin previously satisfied `is_admin()` for every admin RLS policy and admin-gated RPC. Migration `20260429000001` adds the filter. _Pattern hit count = 1 for `is_admin()` specifically; not promoted to a new rule yet — flag and watch for a second occurrence in any other admin-gated function._

### Privilege-Layer Column REVOKE/GRANT (Defense-in-Depth)

**Rule:** Answer-key columns on questions are critical — they must never be exposed to students. RLS cannot restrict columns, only rows. Apply Postgres privilege layer as a second defense:

```sql
-- Questions table answer-key columns (mig 094, mig 111):
-- canonical_answer, accepted_synonyms, dialog_template, blanks_config (short_answer & dialog_fill keys)
-- correct_option_id (multiple_choice key, added in mig 111 / #823)
-- These are readable by SECURITY DEFINER RPCs (postgres owner) and service role (admin scripts).
-- For authenticated role (students + admins): REVOKE SELECT on these columns.

REVOKE SELECT ON questions FROM authenticated;
GRANT SELECT (
  id, organization_id, bank_id, subject_id, topic_id, subtopic_id,
  lo_reference, question_number, question_text, question_image_url,
  options, explanation_text, explanation_image_url,
  difficulty, status, version, question_type, has_calculations,
  created_by, deleted_at, deleted_by, created_at, updated_at
) ON questions TO authenticated;
-- canonical_answer, accepted_synonyms, dialog_template, blanks_config, correct_option_id are omitted.
```

**Consequence:** A direct `.select('correct_option_id')`, `.select('canonical_answer')`, or `.select('*')` from an authenticated client returns `42501 (permission denied for column)` before RLS evaluation. Admins read answer-key columns through the `get_question_authoring_fields()` RPC (mig 094b / 114, is_admin()-gated). Students read the correct option ID post-session only via `get_report_correct_options()` and `get_vfr_rt_exam_results()` RPCs (mig 114 / 113, #823), which are gated to `ended_at IS NOT NULL` (completed sessions only).

**Rationale for relocation (mig 111, #823):** The MC answer key was originally stored as `correct: boolean` inside the `options` JSONB array. Column-level REVOKE cannot target keys nested in JSONB, only top-level columns. Moving the key to a dedicated `correct_option_id` column allows the privilege layer to protect it consistently alongside the other answer-key columns. The `options` column no longer carries `correct`; a trigger (`trg_sanitize_question_options`) strips it on every write.

**Precedent:** Mig 20260605000001 applied the same pattern to `quiz_sessions` scoring columns (`ended_at`, `correct_count`, `score_percentage`, `passed`) — students cannot UPDATE them directly, only SECURITY DEFINER RPCs can write scores. The `questions` column REVOKE/GRANT extends this pattern from write-protection to read-protection.

---

## 11c. Sibling SECURITY DEFINER RPC Guard-Set Consistency

SECURITY DEFINER functions accrue defensive guards over time, one migration at a time. The recurring failure mode (count=3) is a NEW guard being added to one member of a feature family while its siblings — which need the same guard — are left unpatched, so a pre-existing exposure silently persists. Worst case: a function is rewritten as a verbatim copy of its own older, weaker body and ships missing guards a sibling already enforces (PR #856, `check_quiz_answer`).

**Rule:** when rewriting or extending any SECURITY DEFINER RPC, compare its guard set against ALL siblings in the same feature family **before committing**; when introducing a NEW guard class into one member, audit every other member for the same guard **in the same commit**. A guard present in any sibling and absent in the target is a gap, not an intentional difference — unless justified (below).

**Guard-class checklist** (apply per function; mark each ✓ / N-A / justified-exception):

| Guard | Form |
|-------|------|
| `auth.uid()` null-check | `IF auth.uid() IS NULL THEN RAISE` (".claude/rules/security.md" rule 7 "Auth check in RPCs") |
| Mode / whitelist | `IF v_mode NOT IN (...) THEN RAISE` (fail-closed `NOT IN`) |
| Soft-delete filter | `AND deleted_at IS NULL` on every SELECT of a soft-deletable table (docs/security.md §15; narrow immutable-column exception) |
| **Active-user / soft-deleted-caller gate** | `PERFORM 1 FROM users WHERE id = <uid> AND deleted_at IS NULL; IF NOT FOUND THEN RAISE 'user not found or inactive'` — or fold `AND deleted_at IS NULL` into a `SELECT … INTO` on `users` with a `NOT FOUND` guard. The mig-076 family (076/078/085/087/088/095b/095c/099/100/103/104/105/106) progressively added this; it closes the "deactivated account with a still-valid JWT" window. |
| Ownership / identity scope | `WHERE student_id = auth.uid()` / `auth.uid() = p_student_id` (".claude/rules/security.md" rule 11 "Multiple Permissive RLS SELECT Policies"; docs/security.md §3 Row Level Security) |
| Org / config-membership | `q.organization_id = v_caller_org_id`, config-membership checks |
| Audit-subquery soft-delete | `deleted_at IS NULL` on FK lookups inside `INSERT INTO audit_events` (".claude/rules/security.md" rule 10 "Audit-event INSERT subqueries") |
| `SET search_path = public` | on the function declaration |

**Justified exceptions:** admin / org-wide RPCs behind `is_admin()` are exempt from per-caller ownership scoping; a function that reads no soft-deletable table needs no soft-delete filter; a function with no `audit_events` INSERT has no audit-subquery concern. `SET search_path = public` has no exceptions — every SECURITY DEFINER function requires it.

**Promotion sweep finding (#883) — CLOSED:** the count=3 promotion swept every SECURITY DEFINER RPC by family and found 4 legacy read-RPCs (oldest enough to predate the mig-076 gate family) missing the active-user gate. All four now have it: `check_quiz_answer` (added mig 117, #823), `get_report_correct_options` (added mig 114, #856), `get_quiz_questions` (added mig 118, Phase 2 — folded into the org-scope `SELECT … INTO`), and `get_session_reports` (added mig 122, this PR). mig 122 aliases `users u` (`u.id`) because `get_session_reports`'s `RETURNS TABLE` declares an `id` OUT param — an unqualified `id` in the gate would be ambiguous (42702 at execution, code-style.md §5(c)). Each is covered by a soft-deleted-caller rejection test.

---

## 11d. Single-Active-Session Invariant (Answer-Oracle Structural Defense)

**Rule:** a student may hold **at most one active (`ended_at IS NULL AND deleted_at IS NULL`) `quiz_sessions` row, across all modes** (#1011, mig 136). This is the **structural complement** to the mid-exam answer-oracle guards in §4 item 6 (`get_study_questions` → `active_exam_session`) and the practice-only guard in `check_quiz_answer` (mig 117): those rules deny *reading* an answer key while an exam is live; this rule denies *starting* a second session at all, so an answer-revealing Discovery/practice session can never **coexist** with a graded exam on the shared org MC pool in the first place.

**Why it matters:** mock/internal/VFR-RT exams grade from the same org MC pool, and the exam runner hands the client each question's `id`. The per-RPC guards already block the live oracle, but defense-in-depth wants the two session classes mutually exclusive at the schema level.

**Mechanism (three layers):**
1. **Schema backstop** — global partial unique index `uq_one_active_session_per_student (student_id) WHERE ended_at IS NULL AND deleted_at IS NULL` (mig 136). Subsumes the three per-mode partial indexes (retained for friendly `unique_violation` messages — see §11 AL). The mode CHECK was widened to add `'discovery'`; a one-time dedup soft-deleted pre-existing multi-active rows (exams never sacrificed) so the index could build.
2. **Per-start-RPC guard** — every start RPC (`start_exam_session` mig 138, `start_internal_exam_session` mig 139, `start_vfr_rt_exam_session` mig 140, `start_quiz_session` mig 141, `start_discovery_session` mig 137) first soft-deletes the caller's own abandoned `discovery` row, then `RAISE EXCEPTION 'another_session_active'` if any *other*-mode active session exists. The index is the concurrent-race backstop.
3. **Discovery as a real row** — Discovery/Study Mode is now a real ephemeral `mode='discovery'` session (mig 137) so it participates in the invariant; it stays non-resumable (the localStorage firewall rejects `discovery`; `get_study_questions` mig 142 whitelists `discovery` so it does not block its own key reads) and nothing-scored, torn down by the `endDiscovery` Server Action on Exit.

**Behavioral consequence:** a student can no longer run a practice/Discovery quiz and an exam simultaneously. See `docs/decisions.md` Decision 49 and §4 item 6.

---

## 12. GDPR & Data Privacy

We store student PII: email address, full name, learning history, exam scores.

### Consent Tracking (GDPR Legal Compliance)

**`user_consents` table (migration 057):**
- Immutable append-only table. Stores every consent decision: Terms of Service, Privacy Policy, and Cookie Analytics — with version, acceptance flag, timestamp, IP, and user agent.
- Direct client inserts blocked by RLS. Writes via `record_consent()` SECURITY DEFINER RPC only.
- First-login: `/auth/login-complete` calls `check_consent_status()` → if user hasn't accepted current TOS/Privacy versions → redirect to `/consent` page.
- `/consent` page: three checkboxes (TOS required, Privacy required, Analytics optional). Server Action calls `record_consent()` three times, sets cookie with version tokens, redirects to `/app`.
- Re-consent trigger: bump `CURRENT_TOS_VERSION` or `CURRENT_PRIVACY_VERSION` in `lib/consent/versions.ts` → cookie mismatch on next request → `/consent` redirect (no DB hit in middleware, check is cookie-based).
- **Rationale:** Audit trail for legal proof of consent. Append-only pattern prevents accidental history loss. Version strings allow fast re-consent detection.

### Required Capabilities (build before first live student)
- **Data export:** instructor can export all data for a specific student (`/admin/students/:id/export`)
- **Data deletion:** instructor can delete a student's account and all associated data (`/admin/students/:id/delete`) — cascades on `users.id`
- **Retention policy:** student data retained for 3 years after last activity (EASA training record requirement), then auto-deleted via scheduled Supabase function

### Data Minimisation
- Do not store IP addresses in `student_responses` — only in `audit_events` and `user_consents` (for consent proof)
- Do not store device fingerprints
- `full_name` is optional — require only `email` at signup

---

## 13. Tenant Scoping (Auth ≠ Scope)

**Rule: After `requireAuth()` / `requireAdmin()`, scope every query and mutation to the actor's tenant ID (`student_id` or `organization_id`). Authentication confirms identity; it does not scope the data set.**

This applies to:
- Student-facing queries: add `.eq('student_id', userId)` or equivalent
- Admin operations via `adminClient` (service role, RLS bypassed): add `.eq('organization_id', organizationId)`
- Query functions called from Server Components: add `requireAdmin()` or `requireAuth()` as the first line — the function must be self-defending regardless of where it's called from

```ts
// ❌ WRONG — authenticated but unscoped
const { userId } = await requireAdmin()
const { data } = await adminClient.from('users').select('*').eq('id', targetId)

// ✅ CORRECT — scoped to admin's org
const { userId, organizationId } = await requireAdmin()
const { data } = await adminClient.from('users').select('*')
  .eq('id', targetId)
  .eq('organization_id', organizationId)
```

**Why:** `adminClient` bypasses RLS entirely. Without explicit org-scoping, an admin at org A who knows a user UUID from org B can read, update, or deactivate that user. Three occurrences of this gap across different sessions (2026-03-13, 2026-03-14, 2026-03-25) prompted this rule.

---

## 14. Dependency Security

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

## 15. Database Rules — Companion Document

All database design rules (soft delete, immutability, idempotency, RPC conventions, full schema SQL) live in `docs/database.md`. Key security-relevant rules from that document:

- No hard `DELETE` anywhere in application code — always `UPDATE SET deleted_at = now()`
- Immutable tables (`student_responses`, `quiz_session_answers`, `audit_events`) have RLS policies blocking UPDATE and DELETE
- `SECURITY DEFINER` RPCs must always include a manual `auth.uid()` check + `SET search_path = public`
- **SECURITY DEFINER soft-delete rule:** Every SELECT inside a SECURITY DEFINER function must explicitly filter `AND deleted_at IS NULL` on all soft-deletable tables. SECURITY DEFINER bypasses RLS — soft-delete policies are not applied automatically and must be replicated manually in every query. **Narrow exception:** SELECTs that retrieve records by IDs stored in an immutable, write-once column may omit the filter, because the accessible ID set is bounded by the immutable prior write rather than by the deleted-at predicate. Current examples: (a) `batch_submit_quiz` in both its initial-submit and idempotent-replay paths reads `questions` — initial via `quiz_sessions.config.question_ids`, replay via `quiz_session_answers.question_id` (both immutable write-once boundaries); `submit_vfr_rt_exam_answers`, `check_quiz_answer` reading `questions` via `quiz_sessions.config.question_ids` (written once at session start; `check_quiz_answer` verifies `p_question_id = ANY(config.question_ids)` before the read, so a question soft-deleted mid-session is still answerable for immediate feedback — mig 117 / #823; `submit_quiz_answer` verifies the same `p_question_id = ANY(config.question_ids)` membership before its questions read, so a question soft-deleted mid-session stays submittable for a fresh graded answer — aligned with `check_quiz_answer` for consistency, mig 123 / #855; `check_non_mc_answer` (the short_answer + dialog_fill + ordering + diagram_label immediate-feedback grader) reads `questions` via the same frozen `config.question_ids` after a membership check, so a question soft-deleted mid-session stays gradeable — mig 119 / #697, widened for `ordering` mig 146 and `diagram_label` mig 153; batch_submit_quiz replay removes the deleted_at filter on the JOIN for consistency — mig 20260619000250 / PR #856); (b) `get_vfr_rt_exam_questions`, `get_vfr_rt_exam_results` reading `questions` via the same frozen `config.question_ids` — both derive the question IDs server-side from the caller-owned session row, never from client input (`get_vfr_rt_exam_questions` since migration `20260611000100` / mig 105, which dropped its caller-supplied `p_question_ids uuid[]` signature for `(p_session_id uuid)`; `get_vfr_rt_exam_results` since its creation in mig 103); (c) `get_report_correct_options`, `get_admin_report_correct_options`, `get_report_answer_keys` reading `questions` via `quiz_session_answers.question_id` — a write-once FK on the immutable, append-only `quiz_session_answers` table (no UPDATE/DELETE policies; resubmits are `ON CONFLICT DO NOTHING`), so a completed-session report still reveals the key for a question soft-deleted after it was answered (`get_report_correct_options`/`get_admin_report_correct_options`: MC key, mig 114 / #823; `get_report_answer_keys`: the non-MC sibling delivering short_answer `canonical_answer` + dialog_fill per-blank `blanks_config` canonicals + ordering per-slot `ordering_items` canonical text [mig 149] + diagram_label per-zone canonical label text via a 2-hop resolve on `diagram_config` [mig 156], mig 133 / #697). Historical scoring and review then need access to records that may have been soft-deleted after the session was sampled. Any new instance of this exception must (a) cite the immutable, write-once column it relies on, (b) include an inline comment at the call site, and (c) cross-reference `docs/database.md` §3 "Scoring Soft-Deleted Questions". The `config.question_ids` write-once guarantee is enforced by trigger `trg_quiz_sessions_immutable_columns` (migration 079) — see `docs/database.md` §1 column-level immutability table.
- All multi-table mutations go through RPCs for atomicity — never multi-step application calls

## 16. What Supabase Handles For Us

These are covered by Supabase infrastructure — no additional work needed:

- TLS/HTTPS for all connections
- Encryption at rest (AES-256)
- Postgres connection pooling (PgBouncer)
- Auth token signing (HMAC-SHA256)
- Storage bucket access control
- Automatic backups (daily, 7-day retention on free tier)

---

*Last updated: 2026-07-02 (§15 example (a)/(c) corrected — the `ordering` [mig 146/149] and new `diagram_label` [mig 153/156] widenings of `check_non_mc_answer` / `get_report_answer_keys` had never been reflected here since VFR RT Phase 5; both closed in the same pass as the Phase 6 diagram_label doc sync) | Earlier: 2026-06-29 (§11d added — single-active-session invariant, #1011: global partial unique index `uq_one_active_session_per_student` + per-start-RPC `another_session_active` guard + Discovery-as-real-row; structural complement to the §4 item 6 answer-oracle guard) | Earlier: 2026-06-24 (§15 example (c) expanded for `get_report_answer_keys` / mig 133 — non-MC report answer-key delivery, same immutable quiz_session_answers.question_id FK boundary) | Earlier: 2026-06-13 (§15 clarified: batch_submit_quiz replay JOIN removed deleted_at filter, justified by immutable quiz_session_answers.question_id FK boundary; check_quiz_answer added active-user gate + practice-mode guard — mig 117 hardening PR #856) | Previous: 2026-06-11 (§15 example (b) updated for mig 105 / 20260611000100); 2026-06-06 (migs 085–090) | Owner: Claude (security-auditor agent reviews every push, red-team agent tests every security change)*
