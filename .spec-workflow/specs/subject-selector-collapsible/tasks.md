# Tasks — Subject Selector Collapsible Panel

## 1. Replace SubjectSelect component
- [x] 1.1 Rewrite `subject-select.tsx` to use `Collapsible` from `@/components/ui/collapsible`
- [x] 1.2 Import `SubjectOption` from `@/lib/queries/quiz` (remove local duplicate type)
- [x] 1.3 Implement collapsed trigger showing selected subject or placeholder
- [x] 1.4 Implement expanded panel with subject list rows
- [x] 1.5 Add selection logic: click row -> call `onValueChange(id)` -> collapse panel
- [x] 1.6 Add CSS transition for smooth expand/collapse animation
- [x] 1.7 Style active/inactive rows, code badges, and chevron rotation

## 2. Verify integration
- [x] 2.1 Confirm `quiz-config-form.tsx` needs zero changes (same props interface)
- [ ] 2.2 Manual test: select subject -> topics load, filters reset, count resets
- [ ] 2.3 Manual test: change subject -> previous state clears correctly

## 3. Testing
- [x] 3.1 Write unit test for SubjectSelect component (collapsed/expanded states, selection)

## 4. Quality checks
- [x] 4.1 Verify file stays under 150-line component limit (85 lines)
- [x] 4.2 Run `pnpm check-types` — no type errors
- [x] 4.3 Run `pnpm lint` — no lint errors
