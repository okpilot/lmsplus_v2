# Design — Red-Team Quiz Session Bugs (Sub-Batch 1)

## Two Independent PRs

| PR | Issue | Files | Risk | Sequence |
|----|-------|-------|------|----------|
| 1  | #629  | 3     | Low  | First — smaller, isolated |
| 2  | #611  | 4-5   | Med  | Second — touches trigger affecting all completion RPCs |

## PR 1 — #629: start_quiz_session p_mode whitelist

### Database change

New migration `081_start_quiz_session_mode_whitelist.sql`:

```sql
-- Bug #629: start_quiz_session accepted p_mode='mock_exam', creating fake exam
-- sessions that bypass start_exam_session's exam_config validation.
--
-- Fix: hard whitelist {'smart_review','quick_quiz'}. mock_exam sessions are
-- created exclusively by start_exam_session (mig 040), which constructs
-- quiz_sessions rows directly with mode='mock_exam' after validating
-- exam_configs and distribution. internal_exam mode is similarly produced by
-- start_internal_exam_session.

CREATE OR REPLACE FUNCTION start_quiz_session(
  p_mode         text,
  p_subject_id   uuid,
  p_topic_id     uuid,
  p_question_ids uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- ... existing declarations ...
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- NEW: whitelist allowed modes BEFORE any other work to fail fast.
  IF p_mode NOT IN ('smart_review', 'quick_quiz') THEN
    RAISE EXCEPTION 'mode_not_allowed';
  END IF;

  -- ... rest of function unchanged ...
END;
$$;
```

The whitelist runs BEFORE the active-user gate so attackers can't probe by varying p_mode. Reuses the existing `mode_not_allowed` exception convention (used elsewhere in `complete_overdue_exam_session` per mig 063).

### New red-team spec

`apps/web/e2e/redteam/start-quiz-session-mode-confusion.spec.ts`

Mirrors the structure of existing redteam specs (e.g., `quiz-session-config-injection.spec.ts`). Two test cases:

1. **Attack 1 — mock_exam mode confusion**
   - Call `start_quiz_session({ p_mode: 'mock_exam', p_subject_id, p_topic_id, p_question_ids })` as authenticated attacker.
   - Assert error contains `mode_not_allowed`.
   - Verify no `quiz_sessions` row was inserted (admin client `.select` count, filtered by attacker_id + post-test timestamp).

2. **Attack 2 — internal_exam mode confusion**
   - Same as Attack 1 but with `p_mode: 'internal_exam'`.
   - Same assertions.
   - `internal_exam` is a current valid mode (since mig 058) produced exclusively by `start_internal_exam_session`. This attack confirms `start_quiz_session` cannot create such a session via mode confusion.

**No `afterEach` cleanup is intentional** — both attacks expect the RPC to raise BEFORE any INSERT reaches the table, so no row is ever created. The spec includes a positive assertion (`expect((rows ?? []).length).toBe(0)` against admin-client SELECT scoped to attacker_id post-test) to verify the no-insert claim. If a future contributor adds a test that exercises a normal (accepted) mode, that test must add session cleanup; this is documented in the spec docblock.

### Doc updates

- `docs/database.md` — add row to RPC summary noting p_mode whitelist (if a row exists for `start_quiz_session`).
- No `docs/security.md` change — this is a fix, not a new rule.

### Tests

- `pnpm test` — existing Vitest tests should continue to pass.
- `pnpm --filter @repo/web e2e:redteam` — new spec must pass.
- Local manual check: start a quick_quiz session via UI to confirm no regression.

---

## PR 2 — #611: extend quiz_sessions immutability trigger

### Database change

New migration `082_quiz_sessions_immutable_score_columns.sql`:

```sql
-- Bug #611 (Vectors BL/BM/BN): trigger `trg_quiz_sessions_immutable_columns`
-- (mig 079) leaves correct_count/score_percentage/passed/ended_at writable
-- by the RLS policy `students_own_sessions`. Students can forge scores via
-- direct PostgREST UPDATE before submitting answers.
--
-- Fix: (a) extend the freeze list to cover the 4 score columns; (b) extend
-- the bypass to allow SECURITY DEFINER RPCs (batch_submit_quiz,
-- complete_quiz_session, complete_overdue_exam_session,
-- complete_empty_exam_session) to update these columns.
--
-- Bypass design: SECURITY DEFINER functions run as the function owner role.
-- In Supabase the owner is one of {postgres, supabase_admin} depending on
-- self-hosted vs cloud and how migrations are applied. We list both plus
-- the existing service_role exemption. The redteam regression test
-- (Attack 9 in quiz-session-mutable-columns.spec.ts) exercises the full
-- batch_submit_quiz round-trip and verifies all 4 score columns get
-- written — if the bypass list misses the actual owner role, this test
-- fails immediately during local dev (before commit), and the migration
-- can be adjusted to include the actual role.
--
-- deleted_at remains in the mutable list. discard.ts:61 writes deleted_at
-- via the user-context Supabase client (createServerSupabaseClient), and
-- deleted_at is not in the trigger's freeze list, so the user-context
-- write path remains valid for soft-delete.

CREATE OR REPLACE FUNCTION quiz_sessions_protect_immutable_columns()
RETURNS TRIGGER AS $$
BEGIN
  -- Bypass: privileged role paths (admin client + SECURITY DEFINER RPC owners).
  -- Includes both common Supabase function owners (postgres for self-hosted,
  -- supabase_admin for cloud) so the migration is environment-tolerant.
  IF current_role IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  -- Existing 10 frozen columns ...
  -- (config, total_questions, mode, time_limit_seconds, started_at,
  --  organization_id, student_id, subject_id, topic_id, created_at)

  -- NEW: score columns
  IF NEW.correct_count IS DISTINCT FROM OLD.correct_count THEN
    RAISE EXCEPTION 'Cannot modify correct_count — quiz_sessions.correct_count is immutable except via completion RPCs';
  END IF;

  IF NEW.score_percentage IS DISTINCT FROM OLD.score_percentage THEN
    RAISE EXCEPTION 'Cannot modify score_percentage — quiz_sessions.score_percentage is immutable except via completion RPCs';
  END IF;

  IF NEW.passed IS DISTINCT FROM OLD.passed THEN
    RAISE EXCEPTION 'Cannot modify passed — quiz_sessions.passed is immutable except via completion RPCs';
  END IF;

  IF NEW.ended_at IS DISTINCT FROM OLD.ended_at THEN
    RAISE EXCEPTION 'Cannot modify ended_at — quiz_sessions.ended_at is immutable except via completion RPCs';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql
   SET search_path = public;

DROP TRIGGER IF EXISTS trg_quiz_sessions_immutable_columns ON quiz_sessions;

CREATE TRIGGER trg_quiz_sessions_immutable_columns
  BEFORE UPDATE OF config, total_questions, mode, time_limit_seconds,
                   started_at, organization_id, student_id, subject_id,
                   topic_id, created_at,
                   correct_count, score_percentage, passed, ended_at
  ON quiz_sessions
  FOR EACH ROW
  EXECUTE FUNCTION quiz_sessions_protect_immutable_columns();
```

### Validation: SECURITY DEFINER role check

**Risk acknowledged:** the bypass relies on the function owner role being one of `{postgres, supabase_admin}`. If this codebase has set a custom owner via `ALTER FUNCTION ... OWNER TO ...` somewhere, or if a future Supabase config introduces a third owner role (e.g., `supabase_storage_admin` for storage RPCs), the bypass would miss and completion RPCs would raise the immutability exception.

**Mitigation:** The dual-role list (`postgres` ∪ `supabase_admin`) covers both production Supabase environments observed in the wild. The redteam regression test (Attack 9 in `quiz-session-mutable-columns.spec.ts`) is the verification gate — it submits answers via `batch_submit_quiz` and asserts the session row's score columns are populated. If the bypass list is wrong for this environment, the test fails on the very first local run, before the migration is committed. Local-dev workflow: `pnpm supabase db reset` → run the new spec → if Attack 9 fails with an immutability error, query the actual owner role and add it to the bypass list.

This is a deliberate trade-off: the alternative (per-RPC `set_config` GUC pattern) is more robust to owner-role changes but requires migrations against all 4 completion RPCs (~4× the migration scope). We accept the small environment-detection risk in exchange for a single-migration fix, gated by a regression test.

### Discard call site verification

`apps/web/app/app/quiz/actions/discard.ts:61` calls `.update({ deleted_at })` on the user-context Supabase client. `deleted_at` is NOT in the trigger's freeze list and remains mutable for everyone — no impact. Verify by re-reading the file during execution.

### Existing spec extension

`apps/web/e2e/redteam/quiz-session-config-injection.spec.ts`:
- Update `FROZEN_COLUMNS_SELECT` constant to include the 4 new columns.
- Update `FrozenColumnsRow` type to include them.
- The `assertSessionStillLocked()` helper covers them automatically (deep-equal on all fields).

### New red-team spec

`apps/web/e2e/redteam/quiz-session-mutable-columns.spec.ts`:

```
test.describe('Vectors BL/BM/BN — quiz_sessions score forgery (issue #611)', () => {
  // beforeEach pattern mirrors quiz-session-config-injection.spec.ts:
  //   - Pre-cleanup: soft-delete any leftover active session.
  //   - Start fresh mock_exam session via start_exam_session.
  //   - Re-read row via admin client; capture baseline (originalFrozen)
  //     for assertSessionStillLocked() deep-equal.
  // afterEach: soft-delete via admin client.

  test('Attack 5 — correct_count forgery is blocked', async () => {
    const { error } = await attackerClient
      .from('quiz_sessions')
      .update({ correct_count: 999 })
      .eq('id', sessionId)
    expect(error?.message).toMatch(/correct_count.*immutable/)
    await assertSessionStillLocked()
  })

  test('Attack 6 — score_percentage forgery is blocked', ...)
  test('Attack 7 — passed forgery is blocked', ...)
  test('Attack 8 — ended_at forgery is blocked', ...)

  test.describe('Regression — SECURITY DEFINER bypass', () => {
    // Nested describe with its own per-test beforeEach session lifecycle.
    // Attack 9 calls batch_submit_quiz, which mutates correct_count,
    // score_percentage, passed, ended_at on the session row. If this test
    // shared a beforeEach session with Attacks 5-8, the post-RPC mutated
    // state would leak into a stale baseline scenario; per-test beforeEach
    // recreation fully isolates it (the outer afterEach soft-delete also
    // runs after Attack 9, leaving no residue).

    test('Attack 9 — batch_submit_quiz writes all 4 score columns successfully', async () => {
      // Submit valid answers via batch_submit_quiz, assert ended_at != null,
      // correct_count >= 0, score_percentage in [0,100], passed is boolean.
      // This is the verification gate for the trigger bypass design — if the
      // dual-role bypass list misses the actual function owner, this test
      // raises the immutability exception and fails immediately.
    })
  })
})
```

The regression test (Attack 9) is the verification gate for the bypass design — it validates the SECURITY DEFINER bypass works in practice, not just theory.

**Test isolation contract:** Attack 9 runs in a nested describe with its own `beforeEach`-scoped session, so the `batch_submit_quiz` mutation in Attack 9 cannot leak into Attacks 5-8's baseline. The outer `afterEach` soft-delete still runs and cleans up. Per-test session recreation in `beforeEach` (already established in `quiz-session-config-injection.spec.ts`) means the same isolation pattern applies if anyone later moves Attack 9 into the outer describe — but the nested describe makes the intent explicit.

**Decision:** put new attacks in a NEW spec file rather than extending `quiz-session-config-injection.spec.ts`. Reasons:
- Different vector group (BL/BM/BN vs AM).
- Different issue # for traceability.
- Existing file's docblock specifically scopes to "config injection" — adding score columns muddles intent.
- The `assertSessionStillLocked()` shared coverage (FROZEN_COLUMNS_SELECT update) provides cross-spec belt-and-suspenders.

**`assertSessionStillLocked()` extension safety:** the existing helper in `quiz-session-config-injection.spec.ts` deep-equals the row against `originalFrozen` (captured post-`start_exam_session`). At baseline, the 4 new score columns are NULL. None of Attacks 1-4 invoke completion RPCs, so the columns stay NULL throughout each test, and the deep-equal holds. The new helper extension is therefore safe by construction — only attacks that DO call completion RPCs (Attack 9, isolated to nested describe) ever change those columns.

### Doc updates

- `docs/database.md` — update the trigger description in the schema section if it lists frozen columns (search for "trg_quiz_sessions_immutable_columns").
- No `docs/security.md` change — existing rules already cover "SECURITY DEFINER RPCs are the only write path for completion fields" implicitly.

### Tests

- `pnpm test` — existing Vitest tests should pass.
- `pnpm --filter @repo/web e2e:redteam` — new spec must pass; existing config-injection spec must pass with extended FROZEN_COLUMNS_SELECT.
- `pnpm --filter @repo/web e2e` — full E2E pass (catches any regression in normal quiz/exam flows).

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Function owner is not `postgres` | Med | High (RPCs break) | Pre-migration `pg_get_userbyid(proowner)` check + regression test |
| `discard.ts` writes ended_at | Low | Med (UI breaks) | Re-read file during exec; only deleted_at written today |
| Other RLS policies allow write to these columns through different path | Low | Low (trigger catches anyway) | Trigger fires on UPDATE OF regardless of RLS — defense-in-depth |
| Concurrent migration race in CI | Low | Low | Each PR adds one migration with sequential numbering; no manual ordering |
| ECQB or other internal flows write `passed` directly | Low | High | Grep for `.update({.*passed` in apps/web; Vitest integration test in batch_submit catches |

## Validation Checklist (per agent-workflow.md § Plan Validation)

- [x] **Impact analysis:** Only `discard.ts:61` updates `quiz_sessions` from non-RPC paths (writes `deleted_at` only — unaffected).
- [x] **Contract check:** Existing `quiz-session-config-injection.spec.ts` will need `FROZEN_COLUMNS_SELECT` extension (planned). No other test asserts the 4 columns are mutable for students.
- [x] **Pattern scan:** Migration 079 + `protect_users_sensitive_columns` (mig 20260316000041) establish the trigger pattern. New migrations follow the same shape.
- [x] **Doc/schema check:** `docs/database.md` may have a "frozen columns" reference to update — verify during exec.
- [x] **Security surface:** Both fixes touch SECURITY DEFINER RPCs and direct REST mutation. Aligns with `docs/security.md` rules 5 (audit log immutability mirrors), 7 (auth check in RPCs already present), 9 (soft-delete unaffected).

## Files Touched (estimate)

### PR 1 (#629)
- `packages/db/migrations/081_start_quiz_session_mode_whitelist.sql` (new, ~30 lines)
- `apps/web/e2e/redteam/start-quiz-session-mode-confusion.spec.ts` (new, ~120 lines)
- `docs/database.md` (modify, ~5 lines)

### PR 2 (#611)
- `packages/db/migrations/082_quiz_sessions_immutable_score_columns.sql` (new, ~80 lines)
- `apps/web/e2e/redteam/quiz-session-mutable-columns.spec.ts` (new, ~200 lines)
- `apps/web/e2e/redteam/quiz-session-config-injection.spec.ts` (modify, ~10 lines — FROZEN_COLUMNS_SELECT + type)
- `docs/database.md` (modify, ~10 lines)
- (`apps/web/app/app/quiz/actions/discard.ts` — read-only verification, no change expected)
