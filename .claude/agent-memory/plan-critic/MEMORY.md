# Agent Memory — plan-critic

> Index of durable plan-review knowledge. Recurring-pattern tracker + stable recipes.
> Per `.claude/rules/agent-memory.md`: keep < 200 lines / < 25 KB. No session logs — git holds history.

## Recurring Issues Tracker

| Pattern | First Seen | Count | Last Seen | Status (→ rule loc) |
|---|---|---|---|---|
| Session-lifecycle save/discard/resume plans adding a NEW `quiz_sessions` soft-delete (#1085) — positive-whitelist, all-3-save-callers, resume-from-session-row traps. ([details](topics/session-lifecycle-1085.md)). | 2026-07-03 | 1 | 2026-07-03 | WATCHING |
| Plans extracting a report/page BODY into a shared ASYNC server component then keeping `page.test.tsx` as the logic test (#1097 VFR-RT report namespace) — after page.tsx becomes `return <View/>`, RTL can't render the async child, so redirect/heading assertions must target the extracted component via `await View(props)` + a co-located `report-view.test.tsx` (§7). | 2026-07-08 | 1 | 2026-07-08 | WATCHING |
| UI-component-reuse & question-type-CLONE plans (Study Mode flashcard reuse; Phase 6 diagram_label clone) miss the reveal-mechanic + shared touch-points. ([details](topics/vfr-rt-question-type-clone-plans.md)). | 2026-06-26 | 2 | 2026-07-02 | WATCHING (2) |
| Drag-drop question-type CLONE plans (diagram_label cloning ordering) under-enumerate execution-only SQL + CHECK/REVOKE/distractor tests. ([details](topics/vfr-rt-question-type-clone-plans.md)). | 2026-07-02 | 1 | 2026-07-02 | WATCHING |
| RPC-signature-change plans (RETURNS TABLE DROP+recreate) miss types.ts drift, LATERAL row-drop on new types, multi-key fan-out key-split. ([details](topics/vfr-rt-question-type-clone-plans.md)). | 2026-06-21 | 3 | 2026-07-02 | RULE CANDIDATE (3) |
| Data-layer-CHECK + regex-hardening answer-leak plans (#951 dialog_fill) — 5-round SQL-mechanics verification (22023 traps, DDL-in-test infeasibility, plan.md count-literal). ([details](topics/regex-hardening-answer-leak-951.md)). | 2026-06-23 | 6 | 2026-06-26 | RULE CANDIDATE (2) |
| VFR-RT Phase 4/5 report-rendering plans (per-question grouping, item-level correct_count) — pagination/builder, field-repurpose, sibling-audit, DIALOG_FILL-CLONE new-type checklist. ([details](topics/vfr-rt-phase4-report-rendering.md)). | 2026-06-24 | 3 | 2026-06-25 | RULE CANDIDATE (3) |
| Plans gate a new SECURITY DEFINER RPC "internal-only" by omitting GRANT — false premise; Postgres/Supabase both default-grant PUBLIC/anon/authenticated, REVOKE required. ([details](topics/security-definer-rpc-plan-lessons.md)). | 2026-06-21 | 2 | 2026-07-02 | WATCHING (2) |
| New key-revealing practice grader RPC plans under-enumerate §15 ordering + per-type correctness guards that double as answer-leak guards. ([details](topics/security-definer-rpc-plan-lessons.md)). | 2026-06-21 | 1 | 2026-06-21 | WATCHING |
| Mechanical static-analysis guard plans (#925 Phase 3 soft-delete guard) under-specify scan scope (scripts/ exclusion) — resolved round 2. ([details](topics/mechanical-guard-plan-925-phase3.md)). | 2026-06-20 | 1 | 2026-06-20 | RESOLVED-WATCH |
| New test-tier plans (app-layer integration) under-specify unit-vitest + tsconfig ingestion exclusions — resolved round 2. ([details](topics/925-integration-tier-plan-lessons.md)). | 2026-06-20 | 1 | 2026-06-20 | RESOLVED-WATCH |
| Integration-test negative/exclusion assertions are vacuous when RLS itself (not the helper) hides the excluded row. ([details](topics/925-integration-tier-plan-lessons.md)). | 2026-06-20 | 1 | 2026-06-20 | WATCHING |
| App-tier mutation-action integration plans under-cover the action contract: null-vs-string fields, full lifecycle test, coalesced fields, multi-token error maps. ([details](topics/925-integration-tier-plan-lessons.md)). | 2026-06-20 | 2 | 2026-06-20 | WATCHING |
| Integration fixture flat admin INSERTs omit NOT NULL/UNIQUE columns the schema requires vs going through the RPC. ([details](topics/925-integration-tier-plan-lessons.md)). | 2026-06-20 | 1 | 2026-06-20 | WATCHING |
| Rule/docs-promotion plans hard-code learner counts + offender inventories that drift from the live tracker between draft and execution — re-derive at exec, git-verify every hash. ([details](topics/rule-promotion-count-drift.md)). | 2026-06-21 | 3 | 2026-07-03 | RULE CANDIDATE (3) |
| #925-family plans cite a stale migration as "latest" RPC body — trace the CREATE OR REPLACE chain before citing. ([details](topics/925-integration-tier-plan-lessons.md)). | 2026-06-20 | 1 | 2026-06-20 | WATCHING |
| Tooling/guard-script plans place new scripts under root /scripts/ which is gitignored — relocate to .claude/hooks/. ([details](topics/925-integration-tier-plan-lessons.md)). | 2026-06-20 | 1 | 2026-06-20 | WATCHING |
| biome `overrides` deep-merges per-rule (doesn't replace the whole ruleset) — a narrow per-glob OFF override is safe. ([details](topics/925-integration-tier-plan-lessons.md)). | 2026-06-20 | 1 | 2026-06-20 | WATCHING |
| Dual-client pattern for app-layer integration tests: action reads cookie-jar session, fixtures seed via a separate client — both must point at the same user. ([details](topics/925-integration-tier-plan-lessons.md)). | 2026-06-20 | 1 | 2026-06-20 | WATCHING |
| Rules-change proposals claim to "keep existing caps" while actually replacing the numeric values — diff proposed values against the binding text. ([details](topics/multi-round-critic-protocol-draft.md)). | 2026-06-20 | 1 | 2026-06-20 | WATCHING |
| Multi-round review-loop proposals risk learner double-counting within-gate re-findings of the same plan/diff as separate occurrences. ([details](topics/multi-round-critic-protocol-draft.md)). | 2026-06-20 | 1 | 2026-06-20 | WATCHING |
| Plans generalizing an MC-only pipeline to new question types omit DraftAnswer/AnswerFeedback widening + loadSessionQuestions caller; batch_submit_quiz's hard NOT-NULL guard must go conditional per type. ([details](topics/new-question-type-storage-and-pipeline.md)). | 2026-06-20 | 3 | 2026-06-20 | WATCHING (3) |
| New-type answer storage-shape ambiguity (single JSON row vs per-item rows) affects report pagination AND score-aggregation (count() vs DISTINCT/CTE) — must specify both. ([details](topics/new-question-type-storage-and-pipeline.md)). | 2026-06-20 | 2 | 2026-06-21 | RULE CANDIDATE (2) |
| Report query SELECT string not updated alongside AnswerRow type widening — new fields stay undefined at runtime despite the TS type. ([details](topics/vfr-rt-question-type-clone-plans.md)). | 2026-06-20 | 1 | 2026-06-20 | WATCHING |
| RETURNS TABLE extension requires DROP+CREATE, not CREATE OR REPLACE (Postgres can't change return type in place). ([details](topics/vfr-rt-question-type-clone-plans.md)). | 2026-06-20 | 1 | 2026-06-20 | WATCHING |
| Session-storage validator whitelist (`quiz-session-validators.ts` examMode check) not widened when adding a new exam mode — breaks tab-refresh state round-trip. ([details](topics/vfr-rt-question-type-clone-plans.md)). | 2026-06-19 | 1 | 2026-06-19 | WATCHING |
| Migration re-timestamp/rebase plans must enumerate inline `mig NNN` SQL-comment cross-refs too, not just docs/ refs. ([details](topics/migration-and-schema-audit-lessons.md)). | 2026-06-19 | 1 | 2026-06-19 | WATCHING |
| Migration renumbering + new-spec-count plans must update ALL 3 tech.md spec-count occurrences + decisions.md, using master's current value, not a stale branch's. ([details](topics/migration-and-schema-audit-lessons.md)). | 2026-06-19 | 1 | 2026-06-19 | WATCHING |
| Multi-query test mocks: single mockFrom/mockRpc keyed by name can't distinguish N sequential calls to the same endpoint — must scope call-order dispatch. ([details](topics/test-mock-scoping-lessons.md)). | 2026-04-11 | 6 | 2026-05-31 | WATCHING (6) |
| UI-sweep text-swap plans (button loading text) must enumerate every test querying that button by its pre-loading accessible name. ([details](topics/test-mock-scoping-lessons.md)). | 2026-06-14 | 1 | 2026-06-14 | WATCHING |
| UI-sweep spinner plans must distinguish sync-nav buttons (no async gap, spinner would flash) from async-action buttons. ([details](topics/test-mock-scoping-lessons.md)). | 2026-06-14 | 1 | 2026-06-14 | WATCHING |
| Multi-query test mocks: single mockFrom can't distinguish N parallel calls to the same table, or count-head vs range-data calls. ([details](topics/test-mock-scoping-lessons.md)). | 2026-04-11 | 6 | 2026-06-01 | WATCHING (6) |
| Test-update scope underspecification: plans say "test update" without naming the specific assertion/fixture/prop that breaks. ([details](topics/test-mock-scoping-lessons.md)). | 2026-04-11 | 8 | 2026-06-18 | WATCHING (8) |
| SECURITY DEFINER RPC plans omit project SQL conventions: is_admin() over inline role lookup, soft-delete filters, cached v_admin_role pattern. ([details](topics/security-definer-rpc-plan-lessons.md)). | 2026-04-11 | 5 | 2026-06-18 | WATCHING (5) |
| Sibling-file audit missed: defensive pattern (error destructure, null guard) added to one action/query file, identical pattern in sibling in same folder untouched. (CLAUDE.md sibling-audit rule.) | 2026-04-11 | 2 | 2026-05-22 | RULE CANDIDATE → CLAUDE.md sibling-audit |
| Plans citing a constraint/mode value must trace the FULL migration chain — a later migration may have widened/renamed it. ([details](topics/migration-and-schema-audit-lessons.md)). | 2026-05-08 | 3 | 2026-05-28 | WATCHING (3) |
| Red-team fixture INSERTs into student_responses must supply selected_option_id correctly (TEXT NOT NULL CHECK IN a/b/c/d, not uuid/nullable). ([details](topics/redteam-spec-organization-lessons.md)). | 2026-05-31 | 2 | 2026-05-31 | WATCHING (2) |
| get_student_streak always returns exactly one {0,0} row for anon/cross-org — generic error/length===0 assertions fail; needs a tailored check. ([details](topics/misc-plan-review-lessons.md)). | 2026-05-31 | 1 | 2026-05-31 | WATCHING |
| Cross-org non-vacuity gap: plans must assert BOTH that the victim org has the resource AND the attacker org does not. ([details](topics/redteam-spec-organization-lessons.md)). | 2026-06-14 | 1 | 2026-06-14 | WATCHING |
| Red-team spec scaffold plans needing multiple caller roles must enumerate every required client fixture. ([details](topics/redteam-spec-organization-lessons.md)). | 2026-06-14 | 1 | 2026-06-14 | WATCHING |
| Red-team success-path plans (test-only) have 3 recurring gaps: numeric-field type-only specs, audit-tracker fixture registration, pool-seed idempotency. ([details](topics/redteam-success-path-gaps.md)). | 2026-07-03 | 1 | 2026-07-03 | WATCHING |

## Durable plan-review checks

### SQL / migrations
- **Trace the full migration chain, not just mig 001.** `quiz_sessions.mode` CHECK widened by mig 058 (added `internal_exam`) and given the canonical name `quiz_sessions_mode_check` — use named `DROP/ADD CONSTRAINT`, not the DO-block predicate-text lookup (that pattern is only for unnamed constraints). `quiz_sessions.deleted_at` added by mig 023 (not in initial schema). Always grep all migrations for `ALTER TABLE` on the target before reasoning about its current shape.
- **CREATE OR REPLACE FUNCTION: trace to the latest definition before flagging a missing pattern.** A later migration may already add the guard/clause. (Pre-Flag Verification — also in `semantic-reviewer.md` / `implementation-critic.md`.)
- **Widening a UNIQUE constraint breaks existing `ON CONFLICT (col-list) DO NOTHING`.** Postgres needs an exact matching unique index. Grep `ON CONFLICT (` across all migrations and include a companion migration rewriting every living RPC's clause (missed for `batch_submit_quiz`/`submit_quiz_answer` on mig 084).
- **`STABLE`/`IMMUTABLE` + `EXECUTE` is a hard error.** Dynamic-SQL RPCs (`RETURN QUERY EXECUTE`) must be `VOLATILE` (or omit the keyword). Model: `get_session_reports`, not `get_admin_student_stats`.
- **New `questions` columns must satisfy existing NOT NULL columns.** `questions.options` is `JSONB NOT NULL`, no DEFAULT — new types (short_answer, dialog_fill) need nullable/DEFAULT/explicit `options:'[]'` or inserts fail silently.
- **New exam modes with answer-bearing question types need a server-side projection RPC.** `get_quiz_questions()` only strips MC correct-option markers; any new correct-answer column (canonical_answer, blanks_config canonical, accepted_synonyms) needs a `get_*_questions` RPC that strips it — never let students SELECT it via PostgREST.
- **`smart_review` passes `p_subject_id = NULL`.** `q.subject_id = NULL` is always NULL in Postgres → 0 rows. Subject-scoped WHERE/COUNT must be `(p_subject_id IS NULL OR q.subject_id = p_subject_id)`.

### Pagination / truncation (PostgREST max_rows = 1000)
- `.limit(N)` with N > 1000 is NOT a safeguard — max_rows=1000 overrides it. Treat as unbounded (e.g. `dashboard-stats.ts` `.limit(10000)`/`.limit(5000)`).
- Truncation audits partitioned by directory miss colocated `queries.ts` in admin sub-routes and the cross-cutting GDPR export layer (`lib/gdpr/collect-user-data.ts`). Scope audits by file-ownership, name the colocated files.
- `.order('id')` tiebreak fails on tables without an `id` column — `flagged_questions`/`active_flagged_questions` use composite PK `(student_id, question_id)`; use `flagged_at`. Verify each target table has the column.
- `fetchAllRows<T>` contract: `data` is always `T[]`, never null. Error-path mocks use `{ data: [], error: {...} }`, not `{ data: null }`. Joins in the `getPage` select need an explicit cast to `PromiseLike<PageResult<T>>`.

### Extraction / file-split
- Removing one function from an over-limit utility file may leave the parent still over the 200-line cap — verify post-extraction line count or scope a second split.
- Query-helper modules extracted from `'use server'` files must NOT carry `'use server'` (they take a `supabase` param; the directive turns exports into Server Actions and breaks runtime calls). Precedent: `collect-user-data-queries.ts`.
- Adding a column to a `.select()` string must also update any local row-type alias used in an `as SomeRow[]` cast (TS doesn't enforce the cast against runtime; missing field is invisible until referenced).
- Replacing one `Promise.all` arm with a helper returning an unwrapped array changes the destructuring (`{ data }` → bare binding) — state it explicitly.

### Component / UI
- Migrating a hand-rolled overlay to a controlled Dialog: removing the mount guard breaks `useState(props…)` initializers (run once at mount) → stale form on reopen. Keep the guard or add `key={entityId}` to force remount.
- Rewriting a component to a new UI lib: the co-located `.test.tsx` mocks the OLD lib by module path — the entire mock + assertions must be rewritten; list the test file under "Files to change".
- `nav-items.ts` icon name is a CLOSED union; `NavIcon` switch silently renders nothing for unknown names. New nav entries reuse an existing icon or add to BOTH the union AND the switch. `sidebar-nav.test.tsx` asserts exact named items — list it as an affected caller.

### Red-team / E2E specs
- A spec's *pass condition* may be a specific error code — hardening that changes the error string (e.g. `23502` → `invalid_question_ids`) breaks the assertion. Check per spec; prefer open `expect(error).not.toBeNull()`.
- Specs fetching question IDs with only `deleted_at IS NULL` (not `status='active'`) feed invalid IDs to new active-status validation. Add `.eq('status','active')` or document seeded-active assumption.
- NUL-byte (`\x00`) injection payloads are rejected by PostgREST (400) before the RPC runs — message won't match the RPC's `RAISE` string; needs a separate assertion branch.
- audit-completeness: `actor_id` differs per event type — admin events (`internal_exam.code_issued/voided`) bind `v_admin_id`; student events bind `v_student_id`. Bind `expected_actor` to the right role or get 0 rows.
- Name the specific RPC per event: `exam.started`/`exam.completed` come from `start_exam_session`+`batch_submit_quiz(mode='mock_exam')`, NOT `start_internal_exam_session`.

### Validation discipline
- Never leave "needs verification" open in a validated plan — resolve before review or the implementer guesses.
- Dual-deletion-path tables (CASCADE + direct admin RLS DELETE, e.g. `exam_config_distributions`): soft-delete-matrix rows must document BOTH paths.
- `userEvent.type('150')` emits 3 change events; `.at(-1)` captures only the final clamped value — that (not "Math.max so exact") is the correct rationale for `toBe(max)`.

### Agent-tooling plans (native subagent memory)
- A Phase-0 spike "confirm the agent reads/writes MEMORY.md" is a false positive if the agent body also has an explicit Read/Write of that file — strip the body instruction first to isolate native-injection engagement.
- Reference matrices (e.g. red-team `attack-surface.md`) must not be renamed to `MEMORY.md` where the curation nudge can prune active GAP rows; keep as a topic file with a no-delete header and update operational references (insights.md) in the same commit.
- After `memory: project` is added, remove body-level "Read your memory file at start" instructions or the agent double-loads (test-writer, code-reviewer, plan-critic, implementation-critic, security-auditor all had these).

| Red-team spec for aggregation RPCs needs an instructor fixture (seedRedTeamInstructor) not present in seed.ts by default — resolved for #673. ([details](topics/redteam-spec-organization-lessons.md)). | 2026-05-31 | 2 | 2026-05-31 | WATCHING |
| Red-team plans must verify proposed Vector IDs against the LIVE attack-surface.md matrix + check tech.md/decisions.md spec-counts. ([details](topics/redteam-spec-organization-lessons.md)). | 2026-05-31 | 4 | 2026-06-09 | WATCHING (4) |

### Return-type contract for incremental additions to query functions
When a plan adds a new code path to a function that returns a discriminated-union result type (e.g. `{ ok:false; error:string } | { ok:true; ... }`), verify every new `return` statement satisfies ALL fields of the matching union arm. Plans consistently specify `{ ok:false }` for new error paths but omit the mandatory `error: string` field — the TypeScript build fails. Always check the full type definition before specifying return values.
| Vector-label collision sweeps must grep ALL red-team spec files, not just the two being renamed — the same label can be an independent usage elsewhere. ([details](topics/redteam-spec-organization-lessons.md)). | 2026-06-09 | 1 | 2026-06-09 | WATCHING |
| Red-team spec additions covering a new RPC path consistently omit updating the attack-surface.md vector row / GAP→COVERED flip. ([details](topics/redteam-spec-organization-lessons.md)). | 2026-06-01 | 4 | 2026-06-06 | WATCHING (4) |

### Red-team batching plans (organization plans, not implementation)
- See [redteam-batching-organization-lessons](topics/redteam-batching-organization-lessons.md) — verify spec-file targets against issue bodies (not PR headline), watch for shared-file conflicts across a batch, don't classify feature issues as spec-only, match attack-surface.md severity labels, and use the exact `batch_submit_quiz` `RETURNS jsonb` result shape (`data.results[N].field`, JSON key `selected_option`) in assertions.

| Two-dir migration mirror drift: supabase/migrations can be newer/binding than packages/db's highest NNN mirror — identify which is authoritative before reproducing a body. ([details](topics/migration-and-schema-audit-lessons.md)). | 2026-06-06 | 1 | 2026-06-06 | WATCHING |
| Sibling-function inline-role-subquery audit: fixing one SECURITY DEFINER function's inline role lookup must enumerate ALL siblings with the same pattern. ([details](topics/migration-and-schema-audit-lessons.md)). | 2026-06-06 | 1 | 2026-06-06 | WATCHING |
| Column-GRANT plans on `users` must verify the actual writable columns from the CREATE TABLE — only full_name is authenticated-writable. ([details](topics/migration-and-schema-audit-lessons.md)). | 2026-06-06 | 1 | 2026-06-06 | WATCHING |
| FK-into-global-table audit: plans claiming "X is the only FK into table Y" must grep ALL migrations for REFERENCES Y, not just the obvious one. ([details](topics/migration-and-schema-audit-lessons.md)). | 2026-06-06 | 1 | 2026-06-06 | WATCHING |

| Spec-count doc updates must grep the FULL steering doc for every occurrence of the exact number string, not just one line. ([details](topics/misc-plan-review-lessons.md)). | 2026-06-06 | 1 | 2026-06-06 | WATCHING |

| Red-team RAISE-string assertions must read the exact string in the LATEST def of EACH RPC — casing/wording is not consistent across sibling RPCs. ([details](topics/redteam-spec-organization-lessons.md)). | 2026-06-07 | 1 | 2026-06-07 | WATCHING |
| #781 cookie-rewrite approach for @supabase/ssr token-refresh is sound (verified against __loadSession internals); config.toml jwt_expiry fallback has CI-wide blast radius. ([details](topics/misc-plan-review-lessons.md)). | 2026-06-07 | 1 | 2026-06-07 | WATCHING |

| E2E un-skip plans for AlertDialogAction with isPending text-flip: dialog stays open during the transition, disabled button prevents a double-click race — plan's assumptions were correct. ([details](topics/misc-plan-review-lessons.md)). | 2026-06-09 | 1 | 2026-06-09 | WATCHING |
| Red-team spec-split plans must read the test BODY before labeling it "probe-only/no cleanup" — some seed fixture rows and need cleanup routing. ([details](topics/redteam-spec-organization-lessons.md)). | 2026-06-09 | 1 | 2026-06-09 | WATCHING |
| Spec-split plans updating attack-surface.md Spec-File column must confirm the Vector ID's description actually matches the test before overwriting a primary-spec entry. ([details](topics/redteam-spec-organization-lessons.md)). | 2026-06-09 | 1 | 2026-06-09 | WATCHING |
| File-split plans marking a helper extraction "possibly" needed must verify definitively whether it's the ONLY path under the target line-count ceiling. ([details](topics/redteam-spec-organization-lessons.md)). | 2026-06-09 | 1 | 2026-06-09 | WATCHING |

## Positive signals (what good plans got right)
- See [tracker-archive § Relocated positive signals](topics/tracker-archive.md) — 6 more examples of plans that verified assumptions correctly (agent-health.yml false-positive fix, cast-guard sweep #677, #673/#789/#367/#792-793/#326 attack-surface reviews) added 2026-07-04.

| Idempotent-resume RPC race-handlers (BEGIN...EXCEPTION WHEN unique_violation) must re-read+return the existing row, not just mirror a non-idempotent sibling's raise-only shape. ([details](topics/misc-plan-review-lessons.md)). | 2026-06-10 | 1 | 2026-06-10 | WATCHING |

| docs/plan.md distinguishes current-state count lines (bump target) from historical Phase-delivery record lines (must NOT be edited). ([details](topics/migration-and-schema-audit-lessons.md)). | 2026-06-11 | 1 | 2026-06-11 | WATCHING |

| Red-team probe-only→seeding spec conversions must update the file header comment (remove "no seeding" claims) + add afterAll cleanup. ([details](topics/redteam-spec-organization-lessons.md)). | 2026-06-13 | 1 | 2026-06-13 | WATCHING |
| Prop-threading plans through intermediate state-holder components must enumerate ALL 4 files: source, form/trigger, state-holder, consumer. ([details](topics/misc-plan-review-lessons.md)). | 2026-06-18 | 1 | 2026-06-18 | WATCHING |
| App-invoke "proxy" of a REVOKE-gated grader RPC via a client-reachable Server Action re-introduces the forgery the REVOKE prevents (ELP Slice-1) — must not be a public 'use server' export, and must re-validate the forwarded path server-side. ([details](topics/elp-oral-exam-security-lessons.md)). | 2026-07-02 | 1 | 2026-07-02 | WATCHING |

| Split-module refactor plans declaring a module "standalone" must verify every function call inside it, not just its own top-level imports. ([details](topics/misc-plan-review-lessons.md)). | 2026-07-02 | 1 | 2026-07-02 | WATCHING |
| Pure-structural-refactor plans (component/hook split) have 2 gaps: a React-hook-containing block moved into a plain helper function, and missing tests for new _hooks/ files. ([details](topics/structural-refactor-hook-and-test-gaps.md)). | 2026-07-03 | 1 | 2026-07-03 | WATCHING |
| ELP #1069 grader-audit-event plan (write_oral_section_grade) — service-role-finalizer audit-INSERT deviation now documented + both blocking edge-fn/COALESCE fixes verified. ([details](topics/elp-oral-exam-security-lessons.md)). | 2026-07-03 | 1 | 2026-07-03 | RESOLVED-WATCH |

## Topic pointers
- [tracker-archive](topics/tracker-archive.md) — relocated verbatim: older single-occurrence (count=1) tracker rows + older positive signals (moved 2026-06-07 to stay under the 25 KB injection cap).
- [pr-836-report-ui](topics/pr-836-report-ui.md) — VFR-RT student-report/flagging UI facts (#697 Phase B/C, #836): report-page structure, `useFlaggedQuestions` is server-result-driven not optimistic, `active_flagged_questions` security_invoker view.
