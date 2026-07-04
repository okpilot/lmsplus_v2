---
name: structural-refactor-hook-and-test-gaps
description: Pure structural-refactor plans (component/hook splits) that misplace React hook calls in plain helpers or omit tests for new _hooks/ files.
metadata:
  type: project
---

## Structural-refactor plan gaps — hook calls and missing tests

Relocated verbatim from plan-critic MEMORY.md (curated to stay under the 25 KB native-injection cap). Pure structural-refactor plans (component/hook splits) that misplace React hook calls in plain helpers or omit tests for new _hooks/ files.

| Pattern | First Seen | Count | Last Seen | Status (→ rule loc) |
|---|---|---|---|---|
| Pure-structural-refactor plans (component/hook split, code-style §1/§2 size/logic fixes) have two recurring gaps: (1) HOOK-CALL-IN-PLAIN-HELPER: when the plan proposes moving a return-object or logic block to a plain `assembleX(...)` helper, verify every line being moved — if it contains a React hook call (`useMemo`, `useRef`, `useSensor`, `useState`), the helper CANNOT be a plain function; must either (a) pre-compute hook values in the parent hook and pass them as parameters to a hook-free helper, or (b) name the helper `useX(...)` as a custom hook. (2) MISSING TESTS FOR NEW _hooks/ FILES: code-style §7 requires a co-located `.test.ts` for every new file in a `_hooks/` directory; structural-refactor plans that create helper files in `_hooks/` (e.g. `session/_hooks/quiz-submit-handlers.ts`, `session/_hooks/use-quiz-state-return.ts`) must list the test file alongside the source file. Files in `_components/` (e.g. `use-ordering-input.ts`) follow the established `use-dialog-fill-input.test.ts` pattern (add test). Cross-check: BOTH hook alternatives (return-object assembly AND pipeline selection in use-quiz-state.ts) contain hook calls (`useMemo` L68, `useRef` L57, `useNavigationGuard` L58) → both alternatives have the same constraint; fix is to pre-compute hook values first. First seen: #887/#1062/#1043 quiz-session structural refactor. | 2026-07-03 | 1 | 2026-07-03 | WATCHING |
