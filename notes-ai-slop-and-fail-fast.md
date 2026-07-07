# Fail-Fast, Confident Plausibility, and the Real Shape of AI Code Slop

> Working notes. Seeded from a personal "fail-fast / let it crash" idea, researched, then hardened
> through **multiple adversarial critic rounds** (full log in Provenance, below — the single source of
> the round count, so this line can't go stale). The first pass was ~1/3 fabricated (invented studies,
> laundered by confident formatting) and caught only because a critic with a *different objective*
> checked. Then a headline risk-ranking survived all four rounds and was still **wrong on a product
> premise** — caught only when the human supplied ground truth (§5). So: **assume a residual undetected
> error still remains in here** — the passes cut the error rate but cannot certify it to zero. Stay
> suspicious; that posture is the whole point (§5).

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

## 4. The taxonomy done right: residual risk, by the defense it needs

The first draft mapped all twelve slop categories to a rule the codebase already had. That felt
rigorous; it was the opposite — **a threat list that maps 1:1 to your existing defenses can only
surface threats you already defend against.** Rank instead by *what survives every mechanical + AI-agent
gate*, grouped by the kind of defense each needs. (The "Blast × Stealth × Prevalence" formula was
fake-quantitative — dropped.)

**Scope correction — the fifth catch (see §5).** An earlier version crowned *aviation domain-correctness
of AI-authored questions* the #1 risk. **Wrong premise.** This app has **no LLM in any production content
path** — questions are human-authored / vetted-imported (`import-questions.ts`, `import-vfr-rt-content.ts`,
ECQB), and the only production model is ELP oral *grading* (an edge function), which scores language
proficiency, not aviation facts. **AI is in the code loop, not the content loop.** Content-correctness is
therefore an *editorial / import-QA* concern — real, but **not AI slop**, because no AI writes the content.
So the residual AI-slop risks here are all **code-side** (AI writes the code):

### A. Deep tier — no *style/schema* gate touches these; they need an independent oracle
1. **Subtle logic bugs in grading / validation code** — a wrong `is_correct`, a broken `normalize-answer`,
   an off-by-one in the fan-out grader ships a wrong *result* even when the question content is perfect.
   AI writes this code, so this is the genuine top risk. Found only by mutation testing or an adversarial
   human.
2. **Test theater** — AI tests written to match AI code, sharing its blind spots. [MutGen](https://arxiv.org/html/2506.02954v4)
   finds ~96% line coverage but only **70–78% mutation score** (and documents 100%-coverage /
   4%-mutation suites). Honest phrasing: *AI tests score materially lower on mutation than their coverage
   implies* — not "kill few mutants." This is what masks #1.

### B. Security / compliance surfaces AI botches (live in *this* app, missed by the style pipeline)
3. **Prompt-injection into the ELP oral-grading edge function** — the one production LLM path ingests
   untrusted student speech/text; a crafted input can hijack the grader. This is the *real* injection
   surface — not the code-review subagents (they never see student content in production).
4. **PII / GDPR mishandling** — EU pilot-training app, real GDPR surface (there's already export code).
   AI-written data-handling that logs PII, leaks it in an error, or botches deletion is not caught by any
   style gate.

### C. Structural risks of the AI-assisted *method* itself
5. **The AI-reviews-AI echo chamber** — but *graded*, not absolute (see §6). Real when critics share the
   generator's model + prompt + objective; it shrinks as you diversify objective/model/tools.
6. **Reviewer automation-complacency** — the human the whole thesis depends on *decays*: green pipelines
   get rubber-stamped. The oracle is fallible and, for a solo non-SME dev, thin.
7. **Security-degradation under iteration** (+37.6%) — the pipeline *re-rolls* fixes; this is the genuine
   justification for the stability floor. Cross-cutting: **model drift** silently re-calibrates all of the above.

### D. Real in general, low for *this* user
8. **Supply chain / slopsquatting** — you rarely add deps; lockfile + a failed install surface a
   hallucinated package immediately. Watch cheaply; *not* your #1.

## 5. Case study: this document caught its own slop — five times

The research pass produced a confident, well-formatted briefing. A fact-checking critic traced every
statistic to a primary source and found a meaningful fraction **fabricated or misattributed by a
circular SEO layer and laundered into authority by my formatting**: a nonexistent "Rust WG 30%" (the
comparison is incoherent — Rust has no exceptions to benchmark); a nonexistent "Stanford/MIT 2M
snippets" study; and "CSET *and* Georgetown" cited as two studies when CSET *is* Georgetown. **This is
the thesis demonstrated on itself: the failure mode you cannot gate against is confident plausibility.**
Note what caught it — not a human skim (which the formatting was optimized to survive) but an AI critic
with a *different objective*. That fact reshapes §6.

**The fifth catch — and the sharpest.** The claim "aviation domain-correctness is the #1 risk" survived
*all four* critic rounds and was still wrong — not on logic or a citation, but on a **product premise**:
no AI is in this app's content loop, so the risk it named cannot occur. None of the AI critics could
catch it, because none of them knew how the product actually works; it was caught only when the human
supplied ground truth. **Confident plausibility doesn't just survive AI review — it survives AI review
*about the wrong thing*.** Only an oracle that knows the actual system (the human, a primary source, a
runtime) closes that gap. Verify premises against the product before building on them.

## 6. The meta-lesson — an independent oracle, *graded by independence* (corrected)

Draft 1's comfort story was "your pipeline covers everything." Draft 2's was "the human is the *only*
out-of-distribution oracle." **Both are hero narratives, and the second is refuted by this very
document** — it was saved by AI critics *and* by the human, at different layers. The honest, graded claim:

> **The one thing no gate catches is confident plausibility. The antidote is an *independent oracle*,
> and independence is a spectrum, not a human/AI binary.**

- **Echo chamber** = critics sharing the generator's *model + prompt + objective*. Useless.
- **Partial OOD oracle** (cheap; *worked here* for the fabricated stats) = a critic with a *different
  objective* (fact-trace vs. style), a *different model family*, or *tools/retrieval* the generator lacked.
  Diverse-objective AI review is plausibly *not* worthless — but one anecdote isn't proof.
- **Ground-truth oracle** (irreplaceable for *premises*) = something that knows the real system — the
  human, a primary source, a runtime/test. The §5 fifth catch shows this is the *only* thing that catches
  a wrong premise; no amount of AI review substitutes for it. But it's **fallible and capacity-limited**,
  so ration it: high-stakes + low-confidence + a sample.

Order the oracles by cost — mechanical grounding check → diverse-objective AI critic → second model →
ground-truth (human/runtime) — and push load down the ladder; reserve the scarce top for what only it can settle.

**On "stop adding AI rounds":** the risk cuts both ways — under-reviewing something that needed a second
pass is as real as echo-chamber waste. Draw the line by **count, not intent** (intent — "for variance"
vs. "for reassurance" — is invisible to the operator, so it can't be the rule). A round earns its place
when it adds a **new objective/model/tool** (breadth), *or* is a variance sample on a non-deterministic
gate **until you have N clean samples** (the floor — 2, or 3 on security paths). Rounds *beyond* N on an
unchanged artifact are echo. And no number of same-distribution rounds substitutes for one ground-truth check.

## 7. The one concrete action

1. **Mutation testing — the single highest-leverage add.** [StrykerJS](https://stryker-mutator.io/docs/stryker-js/vitest-runner/)
   has a first-class Vitest runner; a broad run is a 30-min-to-4-hour tax its own maintainers warn against
   per-PR. Pin the `mutate` glob to *grading + answer-validation modules only* (the fan-out grader,
   `normalize-answer`, the validators), assert a mutation-score threshold on that tiny set, run it
   nightly/manually — not a commit gate. This directly attacks the real #1 (AI-written grading-code
   correctness) and the test theater that masks it. **Tracked: #1095.**

**Retracted: the "cite-the-source / corpus content-QA" idea (was #1096, now closed).** It assumed AI
authors the questions and needs grounding. It doesn't — no AI is in this app's content loop (§4). The
idea is sound *for a product that generates content*; it just isn't this one. Its retraction is the fifth
entry in this doc's own confident-plausibility ledger — filed, feasibility-checked, and *still* wrong on
the premise until the human caught it.

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
**round 4** (stability): feasibility clean; over-correction found only a stale self-count → **human review
(post-render)** caught the deepest error of all: the "#1 = aviation domain-correctness" ranking rested on
a false product premise (no AI in the content loop). Four AI rounds could not catch it; the human did, on
sight. That is §5's fifth catch and the doc's most important single lesson.

**Eight AI critic passes over four rounds, plus one human correction.** That diversity *plausibly* helped,
but the only evidence is this one document (n=1), so don't read it as proof of the method. Honest status:
a strict clean floor was *never formally met* — every layer found *something*, and the sharpest finding
came from outside the AI loop entirely. On a document about confident plausibility, a fresh lens keeps
finding one more wrinkle; the ground-truth lens finds the ones that matter most. Hold any future addition
to the same bar: primary source or mark it `[unverified]`.
