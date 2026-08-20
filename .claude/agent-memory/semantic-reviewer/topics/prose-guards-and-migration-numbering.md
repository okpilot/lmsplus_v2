# Detail for three tracker rows opened 2026-08-15 (`chore/proportionate-review-gates` PR sweep)

Referenced from `MEMORY.md`. Keep rows terse there; detail lives here.

## 1. Machine guard keyed on a PREFIX of free-text prose

`apps/web/scripts/import-vfr-rt-content.ts` gated the production content import with
`FORCE_REMOTE && typeof file.status === 'string' && file.status.startsWith('PILOT')`.

`status` is a human-authored paragraph in the content JSON. Commit `6abd4456` rewrote it to start
with `"51 questions across the guide's …"`, so the guard became permanently false. The same string
still ends with *"the importer refuses --force-remote while this string starts with PILOT"* — a
self-referential and now-false claim. Two further surfaces kept asserting the guard was live: the
code comment directly above it, and `docs/plan.md` ("status still `PILOT` … so prod is untouched").

**Review rule:** for any `startsWith` / `includes` / regex guard, read the CURRENT value of the
field it tests — never the comment or the doc. A guard predicate belongs on a STRUCTURED field
(`lifecycle: 'pilot' | 'released'`), fail-closed when absent or non-string, with a unit test.
The importer had no test file at all, which is why an unrelated content edit could disable it.

Related: the same field also carried a stale count ("51 questions", "all 52") against an actual
pool of 50 — free-text prose accumulates drift in every direction.

## 2. Migration-number collision in the header comment

`supabase/migrations/20260815000100_answer_typo_tolerance.sql` opens `-- Migration 142`. The
sequence is at 157 (`20260809000100` = "Migration 157"), and 142 is already
`20260629000700_get_study_questions_whitelist_discovery.sql`. `docs/database.md:817` cites the real
mig 142 for the Discovery answer-oracle guard, so the same doc now gives "mig 142" two meanings.

The wrong number propagated to: the migration header + `COMMENT`, `docs/database.md` (new
`answer_matches` section), `docs/decisions.md` Decision 56 (×3), `docs/plan.md` (×2), and
`apps/web/lib/grading/normalize-answer.ts`.

**Review rule:** derive the next number with `grep -h '^-- Migration' supabase/migrations/*.sql`
and take max+1 — never from the branch's own recent files or from the plan text. Note there is a
pre-existing duplicate at 143 (`questions_ordering_type` and
`get_filtered_question_counts_question_type`), so max-by-count is not a substitute for max-by-grep.

## 3. New-guard test that a coarser pre-existing rule already satisfies

Sibling mechanism of the PROMOTED fallback-coincidence row (`code-style.md` §7).

`answer_matches` (mig `20260815000100`) enforces Decision D56: *any token containing a digit must
match exactly*. All four committed `it.each` cases used digit tokens of ≤4 characters
(`1014`/`1015`, `32`/`33`, `6502`/`6503`, `1180`/`1185`). The function's *separate* length floor
(`length(wb) < 5 → lim 0`) rejects every one of them regardless, so all four pass with the digit
guard deleted. The invariant the feature "must never" violate had zero real coverage.

**Disproof technique:** re-evaluate each fixture with the new guard mentally removed. If the
expected result is unchanged, the test is vacuous with respect to that guard. Pick a fixture only
the NEW guard rejects — here `answer_matches('12551', '125.50')` (a real pool frequency: 125.50 vs
125.51 MHz, both normalise to 5-char digit tokens 1 edit apart, so the length floor admits them and
only the digit rule rejects them).

> Rows 1–3 above were all FIXED in `365730e2` (structured `lifecycle` field; renumber to 158/159/160;
> the `12551`/`125.50` fixture). Kept as the mechanism record. The PR-level sweep then found rows
> 4–5 below, which per-commit review structurally could not see.

## 4. Comment names a rule or file location a LATER commit on the same branch retired or moved

Three instances on one branch, three different commits, all invisible per-commit because the
comment and the change that falsified it landed separately:

- `apps/web/scripts/dialog-fill-content.ts:279` — `assertRecallBlank`'s docblock opens *"R2 + R3 for
  one recall blank. R2 constrains the CANONICAL only…"*. Written in `35e4ee25`; `6c07472f` retired
  R2 and R4. The same FILE contradicts it twice (module docblock "R1/R3/R5/R6/R7", rule list "R2 …
  and R4 … were REMOVED"), so the contradiction is intra-file — a grep for "R2" finds it.
- `apps/web/app/globals.css` header — *"dialog_fill blank inputs (dialog-line.tsx). The inline
  `width` there is a character-count estimate"*. Written in `79cc72a7`; `9e651aaf` extracted
  `DialogBlank` and moved the estimate there, publishing it as the custom property `--blank-w`
  *specifically so it is not an inline `width`*. `9e651aaf` edited LATER paragraphs of the same
  comment for the extraction and left the header.
- `.claude/run-log.md:37` — *"D56, mig 142 `answer_matches`"*, missed by `365730e2`'s own
  "renumbered per-citation across 11 surfaces" sweep. `mig 142` is the Discovery whitelist.

**Review rule:** when a commit RETIRES a named rule, RELOCATES a symbol, or RENUMBERS an identifier,
grep the retired/old token across the whole tree, not just the files the commit touches — and when
a commit edits *part* of a multi-paragraph comment, re-read that comment end-to-end. A partial
comment update is the tell.

## 5. ~~A doc asserts a prod-verification result a later commit's rationale contradicts~~ — FALSE POSITIVE

**Withdrawn 2026-08-15 (final pre-push sweep). The chronology was inverted; do not re-raise.**

The original finding read: `.claude/run-log.md:35` (`864936ca`) records the Part 1 prod import as
*"verified them by read-back (40/40 status=active, **canonical matches file**…)"*, and `a58e4d49`
*then* changed CAVOK's canonical — so prod must be stale, as `365730e2`'s `--sync-content` blurb
("**which the insert-only importer cannot reach**") asserted.

`a58e4d49` is `2026-08-11 16:10:27 +0200`; `864936ca` is `16:22:42`. The edit came FIRST, and
run-log row 35 is that same run: it records the CAVOK swap *and* the import *and* the read-back in
one entry. So "canonical matches file" was true when written and is still true — confirmed by the
read-only prod probe in `070dca8f`, which found canonical, synonyms and explanation all matching.

The genuine defect was the OTHER half: `365730e2` asserted prod staleness nobody had checked and
scoped a production-WRITE path around it. That is already captured — learner tracker "Reviewer/CR
finding's premise accepted w/o verification, later disproven" (count 3, PROMOTED →
`agent-workflow.md § Finding Validation`, "*production is in state X* → probe production
read-only"), and the importer header was rewritten in `070dca8f` to say so explicitly.

**Lesson kept:** when two surfaces appear to contradict, order the COMMITS by timestamp before
concluding which falsifies which — a same-run edit-then-verify reads exactly like a
verify-then-invalidate in a flat file listing.

---

## PR-level sweep, 2026-08-16 (`chore/proportionate-review-gates`, 37 commits) — +6 comment-accuracy instances

Four of the six were **created or left standing by `070dca8f`**, the commit whose entire purpose was
correcting eight false comments. That is the durable lesson: a comment-accuracy fix is the highest-risk
site for a new comment-accuracy defect, because the author is editing prose at speed across many files.

| # | Site | Mechanism |
|---|---|---|
| 1 | migs 158 L42 / 159 L3 / 160 L3 | "Bodies are otherwise verbatim … only the comparison changed." `070dca8f` then added two `RAISE` guards to mig 160 and a `coalesce` to 159, and never touched the headers (its diff on mig 160 starts at L179). **Concrete harm:** migs 153/159 establish a re-emit-verbatim-from-parent idiom, so a future author trusting the header would restore from `20260623000800` + swap the comparison and silently DROP both NULL-canonical guards that security.md rule 12 parity required. |
| 2 | `short-answer-input.tsx:56` | Credits `dialog-line.tsx` with "the same guard on the same key". `9e651aaf` moved the IME/Enter handler to `dialog-blank.tsx`; `dialog-line.tsx` at HEAD has no keyboard code at all. `dialog-blank.tsx:53` names short-answer-input correctly → one-sided stale. SECOND instance from the same extraction; `070dca8f` fixed the `globals.css` one and missed this. |
| 3 | `normalize-answer.ts:1-6` | Header (rewritten by `070dca8f`) says the TS copy "has to agree with the database's notion of 'the same string'". Since mig 158 the DB's notion is `answer_matches` (fuzzy); R3 is exact. Underlying gate gap deferred as **#1194** — the *claim* is not covered by that deferral. |
| 4 | `import-vfr-rt-content.ts:41-42` | `--expect-canonical="Ceiling and Visibility OK"` usage examples encode the CAVOK pre-state that lines 26-32 of the SAME docblock declare disproved by a read-only prod probe. Behaviourally harmless (`alreadyInSync` short-circuits) but it is the invocation an operator copies. |
| 5 | `CLAUDE.md` run-log exemption | "FOUR run-log-only commits (`6aa1ebfc`,`4966d0cb`,`864936ca`,`5f207d24`)" — `33ecab8b` landed after and makes five (all verified run-log-only). **Third drift of this one literal**: three→four (impl-critic)→five (this sweep). A count that enumerates commits on its own branch is guaranteed to drift; write it as a set or omit it. |
| 6 | `dialog-fill-content.ts:311` | R5 header: "a readback line must leave at least one CONTENT item visible". Implementation fires only at `contentBlanks.length >= 2`; 13 shipped lines have one content blank and zero visible content items. Accurate wording exists 150 lines away at :464. |

**Sweep technique that worked and is worth repeating:** for a migration claiming "verbatim from mig X",
extract both bodies and `difflib` them rather than reading either. That is what turned an unfalsifiable
prose claim into finding #1 in one command. Enumerate the chain with a `grep -lE '(CREATE OR REPLACE|CREATE|DROP) FUNCTION[^;]*<name>'`
over `supabase/migrations/*.sql` sorted by timestamp first — mig 153 supersedes via DROP+CREATE, so a
`CREATE OR REPLACE`-only grep finds the wrong parent.

## Comment/docblock false-claim row — full detail (relocated from MEMORY.md 2026-08-19)

Tracker row: "Comment/docblock names a rule, symbol or file location a LATER commit retired,
relocated or renumbered." First seen 2026-08-15, count 15, last 2026-08-19 (`7a02f45a`).
Structurally invisible per-commit — apply on the PR-level sweep.

**The sweep obligation (what §10 lacks, and the reason this is a PROMOTE candidate):** grep the OLD
token tree-wide, not just touched files; re-read edited comments end-to-end; re-verify any "verbatim
from mig X" claim by actual diff.

**A comment-accuracy fix is the highest-risk site for a new one — 7 of 15 instances were created BY
such a commit.**

- 2026-08-16 PR-sweep added 6, four of them created or left standing by `070dca8f`, the
  comment-accuracy FIX commit itself (incl. migs 158/159/160 "verbatim … only the comparison
  changed", falsified by guards that same commit added).
- 12th (`b28cc604`, post-merge audit): a NEW file's docblock (`apps/web/scripts/mc-content.ts`)
  argued its gate from stored MC option order, which BOTH delivery RPCs shuffle (`ORDER BY random()`,
  migs `20260702000300` / `20260623000600`).
- 13th + 14th (`6cf8e1fc`, both in the CR-local fix commit itself), two NEW sub-mechanisms:
  - (13) a comment asserting a mechanism "was pinned by nothing" while an EXISTING test in the SAME
    file pins it — `mc-content.test.ts`'s new fixture claimed substring-vs-`===` was unpinned;
    mutating `includes`→`===` reddens TWO tests, incl. the corpus sweep on exactly the PMC-03 case
    the comment cites as its own evidence, and the sweep's own comment 20 lines above already says
    so. **Run the mutation over the WHOLE file and read what else went red before claiming "pinned
    by nothing".**
  - (14) a comment naming a WRITE-path Zod schema as the READ-path enforcer —
    `seed-quiz-setup-eval.ts` cites `draft-schema.ts` rejecting `currentIndex >= questionIds.length`
    to claim a short draft is "unloadable"; `SaveDraftInput`'s only consumer is `saveDraft`, and NO
    read path bounds-checks `current_index` (`rowToDraftData` passes it through; `loadDraftForResume`
    never selects it; the real `>=` guard in `quiz-session-active-validation.ts` validates
    **localStorage**, not the DB row). **Before citing a validator as the thing that rejects X, grep
    its consumers and confirm it runs on the path you named.**
- 15th (`7a02f45a`, the `code-style.md` §10 open-set-clause PROMOTION commit itself), two false
  counts in prose it newly wrote:
  - "the mirror stayed fail-open for **three** commits" (`agent-workflow.md § Rule-Mirror Sync`, and
    again in the learner tracker row) — `git log --oneline 79384dce..c9b4db03` lists 6 commits, i.e.
    5 intervening, 6 spanning. Three is defensible ONLY as the count of non-docs-only commits in
    the range (e3ce7511, e5a3009c, b1280606) — but the text carried no such qualifier, and the
    unqualified reading gives 6.
  - "the no-soft-delete tables that lacked the `deleted_at` column **as of 2026-06-20**"
    (`code-style.md § Soft-Delete Filter Requires the Column to Exist`) — the 7-table form of that
    list landed in `12b553d2` on 2026-06-21 and the current 10-table form in `e12ed809` on
    2026-07-12; there is no 2026-06-20 measurement. The ten NAMES are correct today (verified against
    the live schema: exactly those ten `public` base tables lack `deleted_at`), so only the date is
    false.

Detail on the six rows added by the 2026-08-16 PR-level sweep: see § PR-level sweep 2026-08-16 above.

## Row detail relocated from MEMORY.md (2026-08-19, budget compaction)

### Local-clock (+0200) date stamped while UTC is still the PRIOR day
`e65f01f4` re-dated `.coderabbit.yaml` and one `commit-review-log.md` row local→UTC, declared the
defect a promotion candidate, then ADDED six `2026-08-19` stamps (4 impl-critic tracker `Last Seen`
cells, 2 topic-file relocation headers) for work committed 2026-08-19 23:06Z; a 7th landed in
`attack-surface.md` via `a046d103`. Every `.claude/rules/*.md` footer in the same commit correctly
reads 2026-08-19. Remedy: derive every dated stamp from `TZ=UTC git log -1 --date=iso-local
--format=%ad` (note plain `%ad` prints the commit's OWN +0200 offset and is NOT a UTC read), never
from the shell clock — the machine is +0200, so every commit after 22:00Z is a trap.

### Authoring gate argued from STORED order on a SHUFFLED delivery surface
`mc-content.ts` key-balance + leading-run docblocks (`b28cc604`). On the STUDENT paths
(`answer-options.tsx`, `options-list.tsx`) letter and marker derive from the same array so they
cannot disagree — but the ADMIN editor `option-editor.tsx` IS the exception: a fixed a/b/c/d slot
grid matched against the SLOT letter, so a gapped run marks the wrong row and saving rewrites the
key from the slot (#1223). Fix landed in `c5d5a98b` (PR #1225): the WHY LEADING RUN block now cites
the admin-editor slot-grid mis-render (#1223) + the `questions_mc_correct_option_id_check` DB CHECK,
not student-visible order. Before accepting any "guessable / the student sees X" rationale on MC
options, ordering items or diagram labels, check whether the delivering RPC shuffles that array —
three of them do. Such a gate may still be worth keeping; restate the WHY, do not delete it.

### Enforcer-mirror incompleteness — the exception/suppression clause is the miss (`9ab38454`)
The rule-11 "an identity guard is not an owner filter" edit reached `security-auditor.md` check 18
but not the SAME file's DO-NOT-FLAG suppression 9, ~85 lines below, which still leads with the bare
`auth.uid()` / `p_student_id` shorthand. Suppressions fail OPEN, so the enforcer's exception ended up
looser than its own check. Generalises the earlier `.coderabbit.yaml` path-block instances: a mirror
sweep must cover a check's exception and DO-NOT-FLAG clauses, which sit far from the check text.

### 18th + 19th instances — `57c3b452` (review-follow-up on `b67beccf`, 2026-08-20)

Both created BY the comment-accuracy fix itself, and both had a CORRECT fix sitting unstaged in
the working tree at commit time (see the "fix left UNCOMMITTED" tracker row).

- `.claude/agent-memory/code-reviewer/MEMORY.md:21` — the row it ADDED reads
  `admin-students.spec.ts grew 492→553L … (+52L)`. The same commit's message says
  *"the reported '492 L' was wrong — the file was already 504"*. Measured:
  `git show b67beccf~1:…` = 504, `b67beccf` = 553, so +49L.
- `docs/security.md:858` — the commit rewrote line 861 (`/consent` bullet) precisely because
  analytics consent was dropped, and left line 858 saying the table
  *"Stores every consent decision: Terms of Service, Privacy Policy, and Cookie Analytics"*.
  Mig `20260327000058_remove_cookie_analytics.sql` DELETEs those rows and recreates the CHECK as
  `document_type IN ('terms_of_service','privacy_policy')`; mig `20260606000001` (latest
  `record_consent`) raises on anything outside that pair. Three lines apart, same bullet list —
  §10 clause 3, "a partial comment edit is the tell", in its purest form.

**What the two share:** the author edited the sentence they were told about and did not re-read the
block. The cheap guard is `git show <sha> -- <path>` on the committed hunk plus reading the whole
enclosing block, not the diff hunk.

### Verified-TRUE claims in the same commit (do not re-flag)

`require-admin.ts:29-36` / `docs/security.md:91` — the Server-Action-no-memo mechanism is CORRECT
on both halves, checked against installed source:
- `react@19.2.8` `cjs/react.react-server.development.js:575-578` — `cache()` reads
  `ReactSharedInternals.A`; falsy ⇒ passthrough, truthy ⇒ `dispatcher.getCacheForType(...)`.
- `next@16.3.0` `dist/compiled/react-server-dom-webpack-experimental/cjs/react-server-dom-webpack-server.node.development.js:6278-6285`
  — `DefaultAsyncDispatcher.getCacheForType` = `resolveRequest() ? cache.cache : new Map()`, i.e. a
  THROWAWAY Map when no request resolves. `resolveRequest()` (:1253) = `currentRequest ??
  requestStorage.getStore()`.
- `.A` is assigned at `:1122` inside `RequestInstance` and NEVER cleared (only other refs are the
  :1116-1117 guard) — so the dispatcher is genuinely truthy, confirming the "not because the
  dispatcher is absent" half. Caveat: it is installed on the FIRST flight Request of the process,
  not at module load, so on a cold start it can still be null; same conclusion either way.
- `next/dist/server/app-render/action-handler.js:987` —
  `workUnitAsyncStorage.run(requestStore, ()=>action.apply(null, args))`, verbatim the doc's claim.
- Same-object check: the flight server takes
  `React.__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE` (:6292-6293), which is the
  object `cache()` reads.
