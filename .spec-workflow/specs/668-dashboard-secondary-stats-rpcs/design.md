# Design — #668 phase 2: dashboard secondary-stats RPCs

## Migration `20260521000006_dashboard_secondary_stats_rpcs.sql`

Both: `LANGUAGE sql SECURITY INVOKER STABLE SET search_path = public`, explicit `sr.student_id = auth.uid()` (§11 — `student_responses` has 2 permissive SELECT policies), `GRANT EXECUTE … TO authenticated`, `COMMENT`.

### `get_student_streak() RETURNS TABLE(current_streak int, best_streak int)`
Gaps-and-islands over DISTINCT UTC response dates:
- `days`: `SELECT DISTINCT (sr.created_at AT TIME ZONE 'UTC')::date` — UTC matches legacy `created_at.toISOString().slice(0,10)`.
- `islands`: `d - (ROW_NUMBER() OVER (ORDER BY d))::int AS grp` — consecutive dates share `grp`.
- `runs`: `COUNT(*)::int AS len, MAX(d) AS run_end GROUP BY grp`.
- `current_streak`: `len` of the run with `run_end >= (now() AT TIME ZONE 'UTC')::date - 1` (today/yesterday), else 0 — replicates legacy `anchoredToNow`.
- `best_streak`: `MAX(len)`.
- No-FROM scalar select returns exactly one `{0,0}` row when empty (plan-critic verified).

### `get_student_last_practiced() RETURNS TABLE(subject_id uuid, last_practiced_at timestamptz)`
`SELECT q.subject_id, MAX(sr.created_at) FROM student_responses sr JOIN questions q ON q.id = sr.question_id WHERE sr.student_id = auth.uid() GROUP BY q.subject_id`. Questions org+non-deleted via RLS `tenant_isolation` (reproduces the legacy non-deleted map). All responses (no `is_correct` filter).

## TypeScript

### `dashboard-stats.ts`
- `+ import { rpc } from '@/lib/supabase-rpc'`
- `getStreakData(supabase)` (drop `userId`): `rpc<{ current_streak: number; best_streak: number }[]>(supabase, 'get_student_streak', {})`; `const row = data?.[0] ?? { current_streak: 0, best_streak: 0 }`; throw on error; `Number()`-coerce.
- `applyLastPracticed(supabase, subjects)` (drop `userId` + `questionSubjectMap`): keep `if (!subjects.length) return subjects`; call `get_student_last_practiced`; build `subject_id→last_practiced_at` map; map onto subjects (`?? null`); throw on error.
- **Delete** `computeStreaks` + `ResponseDateRow`.

### `dashboard.ts`
- `getSubjectProgressWithMap` → `getSubjectProgress`, returns `SubjectProgress[]`. Remove `questions` read (L103), `questionSubjectMap` build (L122-125), `QuestionIdSubjectRow`, `SubjectProgressResult`, deferred-map comment (L94-100).
- `getDashboardData`: destructure `subjects` directly from Promise.all; `getStreakData(supabase)`; `applyLastPracticed(supabase, subjects)`.

## Tests
### `dashboard-stats.test.ts`
- Extend `vi.hoisted` with `mockRpc`; **keep `from: mockFrom`** (getQuestionsToday); add `vi.mock('@/lib/supabase-rpc', () => ({ rpc: (...a) => mockRpc(...a) }))`.
- Rewrite getStreakData tests: wiring, `Number()` coercion (string→num), empty `data`→`{0,0}`, error→throws.
- Rewrite applyLastPracticed tests: drop map arg; RPC-driven mapping; subject absent→null; empty subjects→short-circuit.
- **Delete** all computeStreaks tests + import.

### `dashboard.test.ts`
- `mockRpc.mockImplementation((_s, fn) => …)` dispatch: `get_student_mastery_stats` / `get_student_streak` (`[{current_streak,best_streak}]`) / `get_student_last_practiced` (`[{subject_id,last_practiced_at}]`).
- Convert the 3 streak tests (L321-403) + last-practiced test (L405-435): values now come from the RPC branches, not `student_responses` mockFrom (streak semantics are SQL-verified, these become wiring assertions).
- Add streak + last-practiced error-path tests (throw).
- Remove dead `questions` branch from mockFrom.

## docs/database.md
2 rows in RPC summary list (after L661) + 2 signature sections (after L2068) mirroring `get_student_mastery_stats`.

## Verification (read-only prod probe)
1. Synthetic: gaps-and-islands SQL over crafted `VALUES` date-sets (empty / today / 3-days-ago→current=0,best=1 / gap / long run).
2. Real: impersonate high-volume student, compare RPC vs old truncated TS values.

## Risks
- Timezone → explicit `AT TIME ZONE 'UTC'`.
- Lost TS streak unit coverage → synthetic + real probes.
- Deploy → Actions degraded; idempotent `CREATE OR REPLACE` manual-apply fallback + `schema_migrations` reconcile (incl. pending 20260521000005).
