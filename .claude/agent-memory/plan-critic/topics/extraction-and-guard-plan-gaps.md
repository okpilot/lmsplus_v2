# Extraction / guard-placement / async-component plan gaps (2026-07-08 → 2026-07-13)

Detail relocated from `MEMORY.md` to stay under the 25 KB injection cap.
Tracker rows in `MEMORY.md` point here; counts live there.

---

## 1. New `_hooks/` utility modules ship without their OWN test

Extraction plans for new `_hooks/` utility modules (builder handlers, load-utility
siblings) mention tests for the parent HOOK but omit a co-located test for the NEW utility
file itself. `code-style.md` §7 applies to **every new file in a `_hooks/` dir**, not just
files named `use-*.ts`.

Instances: #928 `quiz-start-handlers.ts`, #1010 `session-bootstrap-load.ts`.

## 2. Snap/clamp plans fix `disabled` but leave `onClick` on the raw value

Plans update `disabled` props to use `effectivePage` but leave `onClick` handlers using
the raw `page` value. Users on deeply-out-of-range URLs then find Prev/Next functionally
broken — each click is still out-of-range and snaps back visually.

Instance: #928 / #1041 batch. **RESOLVED** — the `onClick` finding was applied into the
plan before the stability round.

## 3. Adding lines to an already-over-cap hook without a same-commit extraction

E.g. `use-session-bootstrap.ts` at 101 lines against a hook cap of 80. Growing it without
budgeting the split in the same commit worsens the violation, and code-reviewer flags it
BLOCKING post-commit.

Instance: #1010 ITEM B. See `code-style.md` §1 "Same-commit extraction".

## 4. Re-entry ref-guard placement cites the wrong precedent

Plans cite a builder WITHOUT a confirm dialog (`quiz-submit-handlers`) as the placement
precedent for start-handler builders that DO have confirm-cancel early-returns. The ref
then ends up BEFORE the confirm, permanently locking re-attempts after the user cancels.

`code-style.md` §6: set the ref AFTER all retryable validators (confirm dialogs included).

Instance: #928 `use-vfr-rt-start` + the extracted start builders.

## 5. Extracting a page BODY into a shared ASYNC server component

Plans extract the body but keep `page.test.tsx` as the logic test. Once `page.tsx` becomes
`return <View/>`, RTL cannot render the async child, so redirect/heading assertions must
target the extracted component directly via `await View(props)` plus a co-located
`report-view.test.tsx` (`code-style.md` §7).

Instance: #1097 VFR-RT report namespace.
