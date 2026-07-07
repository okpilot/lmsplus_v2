# Fail-Fast, Confident Plausibility, and the Real Shape of AI Code Slop

> Working notes. Seeded from a personal "fail-fast / let it crash" idea, researched, then hardened
> through **multiple adversarial critic rounds** (full log in Provenance, below — the single source of
> the round count, so this line can't go stale). The first pass was ~1/3 fabricated (invented studies,
> laundered by confident formatting) and caught only because a critic with a *different objective*
> checked. So: **assume a residual undetected error still remains in here** — the critic passes cut the
> error rate but cannot certify it to zero. Stay suspicious; that posture is the whole point (§5).

---

## 1. You are holding two ideas, not one

| | **Fail-Fast** | **Let It Crash** |
|---|---|---|
| Layer | Code / function | System / architecture |
| Question | "Should I *detect and surface* this now?" | "How does the system *recover* when a part dies?" |
| Needs | Just discipline — usable today | A supervisor + isolated, restartable processes |
| Origin | Jim Gray, transaction systems | Joe Armstrong / Erlang, built *on top of* fail-fast |

Armstrong's "let it crash" **contains** fail-fast — the crash is safe only *because* a supervision tree
restarts the process to a known-good state. Erlang programmers write little defensive code precisely
because the recovery layer exists. Remove the supervisor and "let it crash" is just crashing. So the
portable habit is **fail-fast**; "let it crash" is an architecture (Elixir/BEAM), parked in the backlog.

## 2. The two axes of every error-handling decision

**Axis A — WHERE do you catch it?** Close to the origin (fail-fast) vs. far downstream (where the `null`
finally explodes). Swallowing moves the failure from origin to a distant, hard-to-diagnose consequence.

**Axis B — HOW loudly, and to whom?**
- **Crash / throw** — for *broken invariants* ("can't happen if upstream is correct").
- **Errors-as-values** (`Result<T,E>`, `{ error }`) — for *expected* failures the caller must confront.
- **Graceful degradation** — retries, cache, fallback — for *non-critical, transient* boundary failures.

**Synthesis: loud toward yourself (logs/Sentry), graceful toward the user.** The classic AI sin —
`catch → return null` — is the one combination quiet on *both* axes. And the nuance most miss:
fail-fast is *not* "throw everywhere." Throwing on an *expected* outcome ("no rows") is a false alarm,
and false alarms train you to mute the panel. Decide by **invariant-vs-expected**, then pick crash /
value / degrade.

## 3. Why AI makes this urgent — mechanisms and verified numbers

**Shelf-life warning:** everything in this section describes *2025–2026 model behavior*. Both the
mechanisms and the numbers are snapshots of current pretraining/RLHF cohorts and will drift as models
change. Re-verify on any model upgrade — especially the one number that drives a live pipeline rule
(the +37.6% below → the multi-round stability floor). A rule pinned to a decaying number is worse than
no rule.

Three mechanisms bias LLMs toward swallow-and-continue: **positive skew** in training data (happy-path
over-represented), an objective that **rewards plausible completion, not correct failure** (a green
console is textually indistinguishable from working code until runtime), and **demonstration bias**
(shown the happy path, it generalizes the happy path).

Numbers that survive fact-checking (primary sources only; treat as *directional*, several are motivated
vendors):

| Claim | Figure | Source | Caveat |
|---|---|---|---|
| Package hallucination ("slopsquatting") | 5.2%–21.7% of pkg refs (commercial→OSS) | [USENIX Sec 2025, Spracklen et al.](https://arxiv.org/abs/2406.10279) | Peer-reviewed, 576K samples. Strongest. |
| Security degrades as you *iterate* | +37.6% critical vulns after 5 rounds | [arXiv:2506.11022](https://arxiv.org/abs/2506.11022) | Model-specific snapshot. Re-calibrate on upgrade. |
| AI code carries a vulnerability | 45% (100+ LLMs / 80 tasks); log-inj ~88%, XSS ~86% | [Veracode 2025](https://www.veracode.com/blog/genai-code-security-report/) | Pass/fail per task. |
| Maintainability trend | copy-paste ↑; refactoring/reuse ↓ ~40–60%; churn ↑ | [GitClear 2025](https://www.gitclear.com/ai_assistant_code_quality_2025_research) | Vendor; directional, not causal. |
| AI PRs vs human | 1.7× more issues (n=470) | [CodeRabbit](https://www.coderabbit.ai/blog/state-of-ai-vs-human-code-generation-report) | Small n; vendor sells AI review. |

**Excluded as fabricated/misattributed (see §5):** "Rust WG 30%", "Stanford/MIT 2M snippets 14.3/9.1%",
"CSET *and* Georgetown 68/73%" (CSET *is* Georgetown; real ≈48%), "20.32% mutation score", tidy
per-category "SQLi 4.2%/XSS 3.8%" rates, "2.7× density / CVSS 2.5×" (that's CodeRabbit's, not Veracode's).

## 4. The taxonomy done right: residual risk, grouped by the defense it needs

The first draft mapped all twelve slop categories to a rule the codebase already had. That felt
rigorous; it was the opposite — **a threat list that maps 1:1 to your existing defenses can only
surface threats you already defend against.** It ratifies the pipeline and cannot surprise you, so it
cannot change a decision. Rank instead by *what survives every mechanical + AI-agent gate*, and group
by the *kind of defense each needs* (ranking the six by a made-up "Blast × Stealth × Prevalence"
formula was fake-quantitative — dropped).

### A. Deep tier — no *style/schema* gate touches these; they need an independent oracle
1. **Aviation domain-correctness** — an AI question can pass schema validation, populate its answer key,
   and clear every critic while being *aeronautically false* (wrong VFR minimum, a distractor that's
   also correct, wrong reg). For a product whose value *is* teaching the correct answer, this is the
   top risk — and it was absent from draft 1 *because* the method was "map to existing rules." **Not
   "uncatchable by any gate"** (that overstatement is corrected below) — but the *least*-covered risk,
   catchable only by a layered content-QA process, not a linter.
2. **Subtle logic bugs** — plausibly-wrong implementations that pass happy-path tests. Found only by
   mutation testing or an adversarial human.
3. **Test theater** — AI tests written to match AI code, sharing its blind spots. The gap is real and
   well-sourced: [MutGen](https://arxiv.org/html/2506.02954v4) finds ~96% line coverage but only
   **70–78% mutation score** (and documents 100%-coverage / 4%-mutation suites). Honest phrasing: *AI
   tests score materially lower on mutation than their coverage implies* — not "kill few mutants."

### B. Security/compliance surfaces AI routinely botches (live in *this* app, not caught by the style pipeline)
4. **Prompt-injection via untrusted content** — the app has LLM-graded oral/ELP sections; any student
   free-text or imported question content that reaches a model — grader *or* review critic (indirect
   injection into the reviewers, not just the graders) — is an injection vector. Arguably top-3 for this
   app and entirely absent from draft 1.
5. **PII / GDPR mishandling** — EU pilot-training app, real GDPR surface (there's already export code).
   AI-generated data-handling that logs PII, leaks it in an error, or botches deletion is not caught by
   any style gate.

### C. Structural risks of the AI-assisted *method* itself
6. **The AI-reviews-AI echo chamber** — but *graded*, not absolute (see §6). Real when critics share the
   generator's model + prompt + objective; it shrinks as you diversify objective/model/tools.
7. **Reviewer automation-complacency** — the human the whole thesis depends on *decays*: green pipelines
   get rubber-stamped. The oracle is fallible and, for a solo non-SME dev, thin.
8. **Security-degradation under iteration** (+37.6%) — the pipeline *re-rolls* fixes; this is the genuine
   justification for the stability floor. Cross-cutting: **model drift** silently re-calibrates all of the above.

### D. Real in general, low for *this* user
9. **Supply chain / slopsquatting** — you rarely add deps; lockfile + a failed install surface a
   hallucinated package immediately. Watch cheaply; *not* your #1.

## 5. Case study: this document caught its own slop

The research pass produced a confident, well-formatted briefing. A fact-checking critic traced every
statistic to a primary source and found a meaningful fraction **fabricated or misattributed by a
circular SEO layer and laundered into authority by my formatting**: a nonexistent "Rust WG 30%" (the
comparison is incoherent — Rust has no exceptions to benchmark); a nonexistent "Stanford/MIT 2M
snippets" study; and "CSET *and* Georgetown" cited as two studies when CSET *is* Georgetown. **This is
the thesis demonstrated on itself: the failure mode you cannot gate against is confident plausibility.**
Note what caught it — not a human skim (which the formatting was optimized to survive) but an AI critic
with a *different objective*. That fact reshapes §6.

## 6. The meta-lesson — an independent oracle, *graded by independence* (corrected)

Draft 1's comfort story was "your pipeline covers everything." Draft 2's was "the human is the *only*
out-of-distribution oracle." **Both are hero narratives, and the second is refuted by this very
document** — it was saved by AI critics, not a human. The honest, graded claim:

> **The one thing no gate catches is confident plausibility. The antidote is an *independent oracle*,
> and independence is a spectrum, not a human/AI binary.**

- **Echo chamber** = critics sharing the generator's *model + prompt + objective*. Useless.
- **Partial OOD oracle** (cheap; *worked once here* — n=1, self-referential — so suggestive, not
  established) = a critic with a *different objective* (fact-trace vs. style), a *different model family*,
  or *tools/retrieval* the generator lacked. This is what caught §5's fabrications. Diverse-objective AI
  review is plausibly *not* worthless — draft 1 nearly threw it away — but one anecdote isn't proof.
- **Strongest OOD oracle** = a human — but **fallible and capacity-limited.** A solo dev is not an SME on
  every EASA topic and will rubber-stamp a plausible fake under volume. So the human is a *rationed*
  channel: spend it on high-stakes + model-flagged-low-confidence + a statistical *sample*, not on "all
  domain facts" (which doesn't scale for one person).

Ordering of oracles by cost: mechanical grounding check → diverse-objective AI critic → second model →
human sign-off. Push load down that ladder; reserve the human for what only a human can settle.

**On "stop adding AI rounds":** the risk cuts both ways — under-reviewing something that needed a second
pass is as real as echo-chamber waste. Draw the line by **count, not intent** (intent — "for variance"
vs. "for reassurance" — is invisible to the operator, so it can't be the rule). A round earns its place
when it adds a **new objective/model/tool** (breadth), *or* is a variance sample on a non-deterministic
gate **until you have N clean samples** (the floor — 2, or 3 on security paths). Rounds *beyond* N on an
unchanged artifact are echo.

## 7. Two concrete additions — reshaped after feasibility review

Both attack the deep tier; both were *wrong as first written* and are corrected here.

1. **Mutation testing — GO, but a *scoped nightly/manual check*, NOT a commit gate.** [StrykerJS](https://stryker-mutator.io/docs/stryker-js/vitest-runner/)
   has a first-class Vitest runner. But a broad run is a 30-min-to-4-hour tax its own maintainers warn
   against on every PR. Pin the `mutate` glob to *pure-logic grading + answer-validation modules only*
   (the fan-out grader, `normalize-answer`, the answer validators — not React, not RPC-integration),
   assert a mutation-score threshold on that tiny set, run it manually or nightly. Scoped this way it's
   cheap and it's the only mechanical defense against test theater (#3) and subtle logic bugs (#2).
2. **Cite-the-source — NO-GO as a bare "quote your source" field; GO only with mechanical grounding.**
   The model writing the wrong fact writes the citation too, and fabricated-but-plausible citations are
   a documented failure mode at scale. A bare citation field *relocates* the human's work and inflates
   false confidence. The version that works: an ingested source-of-truth corpus (EASA reg / AIP /
   syllabus) → **deterministic exact/fuzzy-quote match** — the quoted passage must be found verbatim in
   the corpus, no LLM needed, auto-rejecting fabricated-citation questions → then a *source-fed* second
   model (given the retrieved passage, not asked "is this true?" cold) → then sampled human SME
   sign-off. The deterministic quote-match is cheap and high-leverage; **assembling/cleaning the corpus
   is the real cost** and the true blocker. Without a corpus, cite-the-source is theater.

**And correcting §4.1's overstatement:** domain-correctness is *not* "uncatchable by any gate." The
layered process above — corpus-grounded quote-match, source-fed second-model claim-check, dual-key /
sampled SME review with inter-rater tracking — is the standard defensible-exam workflow and each layer
shrinks the human surface. The human is required for *final sign-off*, not as the *only* filter.

## 8. Still open / not yet addressed here
Accessibility of AI-generated UI; cost/latency of the pipeline itself; a concrete rubric for "needed vs
redundant round" beyond the §6 heuristic; and — flagged honestly — the near-certainty that a number in
§3 is still soft despite two fact-check passes.

---

### Provenance
Personal fail-fast note → web research → **round 1** (source-integrity + reasoning/bias) caught the
fabricated stats and the rule-mapping bias → **round 2** (over-correction + feasibility) caught the
human-oracle absolutism, the self-trust laundering, and the gamed cite-source check, and reshaped §7 →
**round 3** (stability) caught a §6 self-contradiction and an n=1 self-validation, folded in →
**round 4** (stability): feasibility clean; over-correction found *no substantive defect* — its one
finding was a stale self-count (this Provenance had been updated in round 3 but its masthead mirror had
not). That is the doc's own "update every occurrence" lesson biting the doc itself; fixed *structurally*
by making this Provenance the single source of the round count, so the class can't recur.

**Eight critic passes over four rounds**, across several distinct objectives — that diversity *plausibly*
helped, but the only evidence is this one document (n=1), so don't read it as proof of the method. Honest
status: substance converged by round 4 (no new content defect in either lens), but a strict clean floor
was *never formally met* — every round found *something*, latterly only self-referential. On a document
about confident plausibility, a fresh adversarial lens keeps finding one more wrinkle; that recurrence is
itself the most honest data point in here. Stopped at the round-4 ceiling, by rule and by directive.
Hold any future addition to the same bar: primary source or mark it `[unverified]`.
