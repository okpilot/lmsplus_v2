# Agent Memory — plan-critic

> Index of durable plan-review knowledge. Recurring-pattern tracker + stable recipes.
> Per `.claude/rules/agent-memory.md`: keep < 200 lines / < 25 KB. No session logs — git holds history.
> Rows are never deleted, only state-transitioned. Detail lives in `topics/` — keep rows to ONE line.

## Recurring Issues Tracker

| Pattern | First Seen | Count | Last Seen | Status (→ rule loc) |
|---|---|---|---|---|
| Rule-restatement plans that enumerate "Files to change" by LINE NUMBER miss occurrences of the same phrase at unlisted lines in the same file — the SAME-WORD-DIFFERENT-LINE gap. `CLAUDE.md:183` "claimed neither exemption" missed while `:547` in agent-workflow.md listed. | 2026-08-19 | 1 | 2026-08-19 | WATCHING |
| A wording-constraint that says "replace every COUNT" without naming grammatical count synonyms ("both", "neither") leaves implementers fixing numerals and skipping pronouns — the synonym must be named explicitly. | 2026-08-19 | 1 | 2026-08-19 | WATCHING |
| Plans that explicitly say "leave historical entry X alone" in docs/decisions.md satisfy themselves by ruling out an OLD entry while the AC requires a NEW one — the two are different rows. | 2026-08-19 | 1 | 2026-08-19 | WATCHING |
| A reduced-cycle justification claims "agent X has nothing to assess" when it DOES (code-reviewer checks actual line counts, not stripped counts; comment additions can breach §1 size limits). | 2026-08-19 | 1 | 2026-08-19 | WATCHING |
| A DERIVED-value redesign specifies the derivation for ONE input domain (text) and leaves the other (floats/coords) unspecified — in the module the plan itself calls "the single owner of the contract". ([details](topics/derived-content-ids-20260817.md#1)). | 2026-08-17 | 1 | 2026-08-17 | WATCHING |
| Deriving an id from a VISUAL/cosmetic constant turns style edits into breaking data changes; the Risk row covers the normalizer, never the INPUTS. ([details](topics/derived-content-ids-20260817.md#2)). | 2026-08-17 | 1 | 2026-08-17 | WATCHING |
| "Existing tests name specific <values>" — grep the literals; they already derived them, and the REAL work (an assertion made unfalsifiable by the new alphabet) went unbudgeted. ([details](topics/derived-content-ids-20260817.md#3)). | 2026-08-17 | 1 | 2026-08-17 | WATCHING |
| An extract-for-line-budget item moves a `console.warn` and never greps the test asserting that exact STRING; the cited precedent's prefix shape differs, so "mirrors X" rewrites it. ([details](topics/derived-content-ids-20260817.md#4)). | 2026-08-17 | 1 | 2026-08-17 | WATCHING |
| A root-guard rewrite copied from a sibling adds an EXTRA clause a later check already rejects — dead clause AND a vacuous new test for it. ([details](topics/derived-content-ids-20260817.md#4)). | 2026-08-17 | 1 | 2026-08-17 | WATCHING |
| FILE-OWNERSHIP table built from stream GLOBS: an item whose file is outside its OWN step's row is silently unassigned. ([details](topics/typo-tolerance-split-20260815.md#9)). | 2026-08-15 | 1 | 2026-08-15 | WATCHING |
| Contract-RETIREMENT items enumerate code-side statements and miss `docs/` prose — grep the CLAIM repo-wide. ([details](topics/typo-tolerance-split-20260815.md#10)). | 2026-08-15 | 1 | 2026-08-15 | WATCHING |
| Multi-STREAM plans partition by FEATURE AREA, not by FILE — build the file→stream map. ([details](topics/typo-tolerance-split-20260815.md#8)). | 2026-08-15 | 1 | 2026-08-15 | WATCHING |
| Renumber PRESERVE set enumerated from citations NAMING the object, missing same-number citations reached otherwise — grep the NUMBER. ([details](topics/typo-tolerance-split-20260815.md#8)). | 2026-08-15 | 1 | 2026-08-15 | WATCHING |
| "Zero-deferral" plans hide unfinished work in a SUGGESTION-disposition TABLE — simulate each APPLY row. ([details](topics/typo-tolerance-split-20260815.md#7)). | 2026-08-15 | 1 | 2026-08-15 | WATCHING |
| A mechanical refactor sold as a BUG's mechanism — count the corpus rows it actually changes. ([details](topics/typo-tolerance-split-20260815.md#7)). | 2026-08-15 | 1 | 2026-08-15 | WATCHING |
| A new corpus/lint GATE with no cleanup of the artifact it guards — fails on first run. ([details](topics/typo-tolerance-split-20260815.md#7)). | 2026-08-15 | 1 | 2026-08-15 | WATCHING |
| A doc COUNT literal fixed in one stream, invalidated by a later one — order the count fix last. ([details](topics/typo-tolerance-split-20260815.md#7)). | 2026-08-15 | 1 | 2026-08-15 | WATCHING |
| Over-broad THRESHOLD patched with a denylist — simulate over the real corpus; the TIER may be the bug. ([details](topics/typo-tolerance-split-20260815.md#1)). | 2026-08-15 | 1 | 2026-08-15 | WATCHING |
| Sibling GRANT cited as precedent and widened unread; "no GRANT" ≠ "not exposed" (PUBLIC EXECUTE default). ([details](topics/typo-tolerance-split-20260815.md#2)). | 2026-08-15 | 1 | 2026-08-15 | WATCHING |
| Migration-SPLIT "verbatim" via body-diff misses REVOKE/GRANT/COMMENT; risk is PARTIAL APPLICATION, not ordering. ([details](topics/typo-tolerance-split-20260815.md#4)). | 2026-08-15 | 1 | 2026-08-15 | WATCHING |
| Prod-write script keys rows on a NON-UNIQUE tuple vs the UNIQUE index; also cited a nonexistent column. ([details](topics/typo-tolerance-split-20260815.md#5)). | 2026-08-15 | 1 | 2026-08-15 | WATCHING |
| `extensions.levenshtein` with no length guard — ERRORs >255 chars while Zod caps at 500; execution-only. ([details](topics/typo-tolerance-split-20260815.md#3)). | 2026-08-15 | 1 | 2026-08-15 | WATCHING |
| Importer new-type `buildRow` branch scoped to "ONLY type-specific columns" silently drops `explanation_text` (spread `base` carries the GENERIC value; NOT NULL still satisfied). | 2026-08-11 | 1 | 2026-08-11 | WATCHING |
| Guard on an OPTIONAL content field sized "~4 lines" omits `typeof === 'string'`, crashing the one file lacking it — the sizing invites the unguarded form. | 2026-08-11 | 1 | 2026-08-11 | WATCHING |
| CR-fixup plans sweep siblings by the finding's IDENTIFIER (RPC name), not by CODE STRUCTURE (`rpc<T[]>` + array-only guard). ([details](topics/cr-fixup-sweep-axis-1185.md#1)). | 2026-08-11 | 1 | 2026-08-11 | RESOLVED-WATCH (rev 2 rewrote the sweep by code structure) |
| New try/catch uses `(err as Error).message`; repo is 100:1 `instanceof Error`, incl. the sibling importer. ([details](topics/cr-fixup-sweep-axis-1185.md#2)). | 2026-08-11 | 1 | 2026-08-11 | RESOLVED-WATCH (rev 2 switched to `instanceof Error`) |
| Plan enumerates prior art, then picks the OPPOSITE disposition (reject-all vs sibling skip-the-row) — diff DISPOSITION, not just shape. ([details](topics/cr-fixup-sweep-axis-1185.md#5)). | 2026-08-11 | 1 | 2026-08-11 | WATCHING |
| Deferred-issue acceptance uses a path prefix narrower than the cross-dir enumeration; Apply-vs-Defer cond. 3 argued on the wrong branch. ([details](topics/cr-fixup-sweep-axis-1185.md#6)). | 2026-08-11 | 1 | 2026-08-11 | WATCHING |
| Rejection log emits `typeof data` — null/array/object all collapse to `'object'`, so log + its two tests can't tell inputs apart. ([details](topics/cr-fixup-sweep-axis-1185.md#7)). | 2026-08-11 | 1 | 2026-08-11 | WATCHING |
| One predicate guarding N serializations of a union field gets DIFFERENT strictness per branch, vs a risk register claiming exact contract match. ([details](topics/cr-fixup-sweep-axis-1185.md#8)). | 2026-08-11 | 1 | 2026-08-11 | RESOLVED-WATCH (rev 4 adopted the single coerce-then-isFinite form) |
| A plan's `Mirrors <file>:<line>` cross-ref is mis-numbered AND behaviourally false — the "mirror" adds a gate the cited sibling lacks; written from shape, never re-read. ([details](topics/cr-fixup-sweep-axis-1185.md#10)). | 2026-08-11 | 1 | 2026-08-11 | WATCHING |
| §3/§1 line budget carried forward from an earlier revision while later revs grew the body — final formatted body lands exactly at cap with the plan claiming margin. ([details](topics/cr-fixup-sweep-axis-1185.md#11)). | 2026-08-11 | 1 | 2026-08-11 | WATCHING |
| Plan assigns all CR findings terminal states (incl. SKIP) but never schedules the `/replycoderabbit` posting step in its execution list. | 2026-08-11 | 1 | 2026-08-11 | WATCHING |
| Guard computes a `findIndex` only to name it in a message; no test pins the INDEX, so `some()`+hardcoded `row 0` stays green. ([details](topics/cr-fixup-sweep-axis-1185.md#9)). | 2026-08-11 | 1 | 2026-08-11 | WATCHING |
| Skip-with-reason on a "missing test" finding argues scope/backlog without grepping the caller's EXISTING `*.integration.test.ts`. ([details](topics/cr-fixup-sweep-axis-1185.md#3)). | 2026-08-11 | 1 | 2026-08-11 | RESOLVED-WATCH (rev 2 added the integration file + run step) |
| `tsc --noEmit <file.ts>` positionally on a tsconfig-excluded dir — CLI-listed files make tsc ignore tsconfig entirely. ([details](topics/cr-fixup-sweep-axis-1185.md#4)). | 2026-08-11 | 1 | 2026-08-11 | RESOLVED-WATCH (rev 2 dropped it; biome lints scripts/ but is not a TYPE gate) |
| RLS-narrowing plans (`FOR ALL`→`FOR SELECT`): right change, wrong justification (WITH-CHECK vs `RETURNING` visibility; unverified `prosecdef`). ([details](topics/1165-rpc-scoping-and-rls-narrowing.md#5)). | 2026-08-09 | 1 | 2026-08-09 | WATCHING |
| Breaking-RPC-**arg**-change plans miss the multi-line `.rpc()` form + tests whose SEMANTICS change. ([details](topics/1165-rpc-scoping-and-rls-narrowing.md#1)). | 2026-08-09 | 1 | 2026-08-09 | WATCHING |
| Plans fixing a client-fabricated identifier must name the CI job catching a regression — Discovery has zero coverage. ([details](topics/1165-rpc-scoping-and-rls-narrowing.md#2)). | 2026-08-09 | 1 | 2026-08-09 | WATCHING |
| §15 carve-outs verify only the UPDATE half — `BEFORE UPDATE OF` never fires on INSERT; probe the INSERT path. ([details](topics/1165-rpc-scoping-and-rls-narrowing.md#3)). | 2026-08-09 | 1 | 2026-08-09 | WATCHING |
| Mode-conditional answer-key strips keyed on the TARGET row's attacker-writable column are self-defeating — key on the CALLER. ([details](topics/1165-rpc-scoping-and-rls-narrowing.md#4)). | 2026-08-09 | 1 | 2026-08-09 | WATCHING |
| UI-reuse & question-type-CLONE plans miss the reveal-mechanic + shared touch-points. ([details](topics/vfr-rt-question-type-clone-plans.md)). | 2026-06-26 | 2 | 2026-07-02 | WATCHING (2) |
| RPC-signature-change plans (RETURNS TABLE DROP+recreate) miss types.ts drift, LATERAL row-drop, multi-key fan-out key-split. ([details](topics/vfr-rt-question-type-clone-plans.md)). | 2026-06-21 | 3 | 2026-07-02 | RULE CANDIDATE (3) |
| Data-layer-CHECK + regex-hardening answer-leak plans (#951): 22023 traps, DDL-in-test infeasibility, plan.md count-literal. ([details](topics/regex-hardening-answer-leak-951.md)). | 2026-06-23 | 6 | 2026-06-26 | RULE CANDIDATE (2) |
| VFR-RT Phase 4/5 report-rendering: pagination/builder, field-repurpose, sibling-audit, DIALOG_FILL-CLONE checklist. ([details](topics/vfr-rt-phase4-report-rendering.md)). | 2026-06-24 | 3 | 2026-06-25 | RULE CANDIDATE (3) |
| Plans gate a new SECURITY DEFINER RPC "internal-only" by omitting GRANT — false premise; REVOKE is required. ([details](topics/security-definer-rpc-plan-lessons.md)). | 2026-06-21 | 2 | 2026-07-02 | WATCHING (2) |
| App-tier mutation-action integration plans under-cover the action contract (null-vs-string, lifecycle, coalesced fields, error maps). ([details](topics/925-integration-tier-plan-lessons.md)). | 2026-06-20 | 2 | 2026-06-20 | WATCHING |
| Rule/docs-promotion plans hard-code learner counts + offender inventories that drift — re-derive at exec, git-verify hashes. ([details](topics/rule-promotion-count-drift.md)). | 2026-06-21 | 3 | 2026-07-03 | RULE CANDIDATE (3) |
| MC-only→new-question-type pipeline plans omit DraftAnswer/AnswerFeedback widening + the loadSessionQuestions caller. ([details](topics/new-question-type-storage-and-pipeline.md)). | 2026-06-20 | 3 | 2026-06-20 | WATCHING (3) |
| New-type answer storage-shape ambiguity hits report pagination AND score-aggregation — specify both. ([details](topics/new-question-type-storage-and-pipeline.md)). | 2026-06-20 | 2 | 2026-06-21 | RULE CANDIDATE (2) |
| Multi-query test mocks: one mockFrom/mockRpc keyed by name can't distinguish N sequential calls — need call-order dispatch. ([details](topics/test-mock-scoping-lessons.md)). | 2026-04-11 | 6 | 2026-05-31 | WATCHING (6) |
| Multi-query test mocks: one mockFrom can't distinguish N parallel calls to a table, or count-head vs range-data. ([details](topics/test-mock-scoping-lessons.md)). | 2026-04-11 | 6 | 2026-06-01 | WATCHING (6) |
| Test-update scope underspecified: "test update" without naming the assertion/fixture/prop that breaks. ([details](topics/test-mock-scoping-lessons.md)). | 2026-04-11 | 8 | 2026-06-18 | WATCHING (8) |
| SECURITY DEFINER RPC plans omit project SQL conventions: is_admin(), soft-delete filters, cached v_admin_role. ([details](topics/security-definer-rpc-plan-lessons.md)). | 2026-04-11 | 5 | 2026-06-18 | WATCHING (5) |
| Sibling-file audit missed: defensive pattern added to one action/query file, identical sibling untouched. | 2026-04-11 | 2 | 2026-05-22 | RULE CANDIDATE → CLAUDE.md sibling-audit |
| Plans citing a constraint/mode value must trace the FULL migration chain — a later one may have widened it. ([details](topics/migration-and-schema-audit-lessons.md)). | 2026-05-08 | 3 | 2026-05-28 | WATCHING (3) |
| Red-team fixture INSERTs into student_responses need selected_option_id (TEXT NOT NULL CHECK a/b/c/d). ([details](topics/redteam-spec-organization-lessons.md)). | 2026-05-31 | 2 | 2026-05-31 | WATCHING (2) |
| Red-team specs for aggregation RPCs need an instructor fixture not in seed.ts by default. ([details](topics/redteam-spec-organization-lessons.md)). | 2026-05-31 | 2 | 2026-05-31 | WATCHING |
| Red-team plans must verify Vector IDs against the LIVE attack-surface.md matrix + tech.md/decisions.md spec-counts. ([details](topics/redteam-spec-organization-lessons.md)). | 2026-05-31 | 4 | 2026-06-09 | WATCHING (4) |
| Red-team spec additions omit the attack-surface.md vector row / GAP→COVERED flip. ([details](topics/redteam-spec-organization-lessons.md)). | 2026-06-01 | 4 | 2026-06-06 | WATCHING (4) |
| Two-dir migration mirror drift — identify the authoritative dir before reproducing a body. ([details](topics/migration-and-schema-audit-lessons.md)). | 2026-06-06 | 1 | 2026-07-11 | RESOLVED (packages/db/migrations frozen 2026-07-11; supabase/ sole truth — #1111) |

## Positive signals
- See [tracker-archive § Relocated positive signals](topics/tracker-archive.md) — 6 plans that verified assumptions correctly.

## Topic pointers
- [cr-fixup-sweep-axis-1185](topics/cr-fixup-sweep-axis-1185.md) — sweep by code STRUCTURE not identifier; diff prior art's DISPOSITION not shape; `instanceof Error`; `typeof` collapses null/array/object; positional `tsc` ignores tsconfig.
- [durable-review-checks](topics/durable-review-checks.md) — per-domain checklists: SQL/migrations, pagination, extraction/file-split, component/UI, red-team specs, validation discipline, return contracts.
- [1165-rpc-scoping-and-rls-narrowing](topics/1165-rpc-scoping-and-rls-narrowing.md) — RPC arg-change enumeration, §15 INSERT-path carve-outs, caller-keyed answer strips, RLS `FOR ALL`→`FOR SELECT` semantics.
- [extraction-and-guard-plan-gaps](topics/extraction-and-guard-plan-gaps.md) — `_hooks/` test omissions, snap/clamp `onClick`, over-cap hook growth, re-entry ref placement, async-component test relocation.
- [tracker-archive](topics/tracker-archive.md) — 57 cold count=1 rows (4 sections: an original relocation plus 2026-08-11, 2026-08-15, 2026-08-17) + positive signals. **Check here before concluding a pattern is new**; re-promote a row if it recurs.
- [derived-content-ids-20260817](topics/derived-content-ids-20260817.md) — derivation specified for only one input domain; ids derived from cosmetic constants; "tests hardcode the values" claims that grep disproves.
- [typo-tolerance-split-20260815](topics/typo-tolerance-split-20260815.md) — corpus-simulated tolerance thresholds, GRANT-precedent verification, levenshtein 255 limit, migration-split partial application, prod-write row keying.
- [pr-836-report-ui](topics/pr-836-report-ui.md) — VFR-RT report/flagging UI facts: `useFlaggedQuestions` is server-result-driven, `active_flagged_questions` security_invoker view.
