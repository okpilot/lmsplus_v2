---
name: pr-836-report-ui
description: VFR-RT student-report UI (#697 Phase B/C, #836) — durable plan-review facts for the report/flagging surface
metadata:
  type: project
---

## VFR-RT student-report UI (#697 / #836) — durable plan-review facts

Relocated from a misplaced `apps/web/.claude/agent-memory/` snapshot (subagent ran with cwd=apps/web during the #836 report work). Useful for imminent Phase B/C report-UI plans.

### Durable knowledge
- `quiz-report.ts` in `lib/queries/` uses `console.error + return null` (not throw) — pre-existing exception to code-style.md §5. New helpers that explicitly degrade gracefully (decorative data) may follow this; flag as SUGGESTION to add JSDoc, not ISSUE.
- `question-breakdown.test.tsx` mocks `ReportQuestionRow` entirely — changes to that component's rendered output do NOT affect question-breakdown tests. Safe to add context reads to `ReportQuestionRow` without touching question-breakdown.test.tsx.
- `report-card.test.tsx` renders the REAL `ReportQuestionRow` but has no button-role assertions and no `not.toBeInTheDocument` for buttons — safe for a flag button that renders only when a context provider is present.
- App Router pattern `(server page) → <ClientProvider>{serverChildren}</ClientProvider>` is valid: client context propagates to client-component descendants even when intermediate nodes are server components. `key` prop on the provider forces remount on soft-navigation param changes — required when the provider seeds `useState` from a server-side read.
- `useFlaggedQuestions` toggle is **NOT optimistic** — it calls the server action first, then updates state from `result.flagged`. Plans saying "mirrors useFlaggedQuestions" + "optimistic" contradict themselves; the correct description is server-result-driven.
- Both student report pages (`quiz/report/page.tsx`, `internal-exam/report/page.tsx`) use `getQuizReportQuestions` — only 2 student report routes exist. Admin pages use `getAdminQuizReportQuestions`.
- `active_flagged_questions` is a `security_invoker` view scoped by RLS — safe to read with the student supabase client; no admin bypass needed.

### Tracker rows (WATCHING, count=1, from #836)
- Plan describes a server-action toggle as "optimistic" but the mirrored hook is server-result-driven. (#836)
- `lib/queries/` helpers: plan proposes degrade-to-`[]`/null without noting the exception to code-style.md §5 throw rule. (#836)
