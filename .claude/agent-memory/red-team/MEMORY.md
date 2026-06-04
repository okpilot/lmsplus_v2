# Agent Memory — red-team (index)

> Auto-injected index for the red-team agent. Keep under 200 lines / 25 KB.
> Per `.claude/rules/agent-memory.md`: only this file is auto-curated. Topic files are read on demand and are never pruned by native curation.

red-team maps security-sensitive diffs to red-team Playwright specs and flags coverage gaps. It does NOT run specs (advisory, non-blocking). Trigger paths and full vector→spec mapping live in the topic file below.

## Topic pointers

- [attack-surface](topics/attack-surface.md) — **PROTECTED** vector→spec mapping matrix (vectors, spec files, Files-to-Watch, dated Lessons Learned). Never auto-curated, never pruned, never inlined into this index. This is the source of truth for which spec covers which attack vector — consult it on every review.

## Durable lessons

- New RPCs need matching **unauthenticated** AND **cross-tenant** test cases on every addition — generic specs do not cover these by default.
- `quiz-report.ts` filters the `correct` boolean in TypeScript (not at the DB layer) after a direct `.select('options')` on `questions` — a refactor of the mapping logic can silently re-expose answer keys. The report payload must never contain `correct` fields. **Vector O is permanently pinned by `report-question-builder.test.ts` (Vitest unit), NOT a Playwright spec — PostgREST-level specs cannot reach TypeScript projection functions. This is the permanent home: app-layer answer-key-leak vectors that rely on TypeScript projection belong in Vitest unit tests, not red-team Playwright specs.**
- Admin SECURITY DEFINER RPCs that gate on `is_admin()` belong in their own dedicated spec file (e.g. `rpc-admin-dashboard-students.spec.ts`), not scattered across Hub A (`server-action-unauthenticated.spec.ts`) and Hub B (`rpc-cross-tenant.spec.ts`). A dedicated file covers all sub-vectors (unauthed, student, instructor, cross-org positive/negative) coherently.
- Specs that must seed an `exam_config` to test child-table RLS must use a free-subject strategy (find a subject with no active config) to avoid colliding with the partial unique index `uq_exam_configs_org_subject_active`. `exam_config_distributions` has no `deleted_at` column — afterEach cleanup must hard-delete the throwaway config (ON DELETE CASCADE removes distributions). This is a legitimate exception to the soft-delete rule.
- The consent gate in `proxy.ts` is cookie-only (no per-request DB check); the auth-session check runs first and is what blocks forged/predictable consent cookies. Pin that ordering dependency in specs.
- The cached-role pattern (SELECT org + role once at authz time, reuse in all audit INSERTs) is now the standard for SECURITY DEFINER RPCs with admin callers — see mig 076 (start_quiz_session), mig 078 (batch_submit), mig 084/085 (void_internal_exam_code). Inline scalar subqueries for actor_role create a NOT NULL abort risk if the caller row is soft-deleted mid-call. Flag any new SECURITY DEFINER function that re-queries `users.role` inline inside an `INSERT INTO audit_events` block.
- Unauthenticated path for each SECURITY DEFINER RPC belongs to the Hub A serial chain (server-action-unauthenticated.spec.ts) — not in per-RPC spec files. When a new per-RPC spec closes IDOR/mode/soft-delete gaps, the unauth case is a confirmed deferral, not a miss. Track it explicitly so the Hub A spec author knows it is expected.
- DELETE RLS USING failures are silent 0-row no-ops (200 OK, error===null, affected_rows===0) — NOT 42501. 42501 (insufficient_privilege) is raised only by INSERT/UPDATE WITH CHECK failures. Any cross-user DELETE spec (question_comments, flagged_questions, or any future table) must assert error===null AND deleted.length===0, then confirm the target row survives via an admin re-read. Issue #711 originally stated "42501" for the deleteComment IDOR case — this was wrong. Confirmed in rpc-comment-idor.spec.ts (commit cb861b4, Vector P).
