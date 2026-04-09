# Plan Critic — Patterns & Memory

## Recurring Plan Issues
<!-- Log patterns here as they emerge across reviews -->

## Common Assumption Failures

### [2026-04-09] Test file mock assumptions when replacing a library
When a component is rewritten from one UI library to another (e.g. shadcn Select → Base UI Collapsible), the co-located `.test.tsx` mocks the OLD library by module path. Plans consistently omit the fact that the entire mock must be rewritten for the new library. The plan correctly identified there is a test file, but did not include the test file in "Files to change" or specify how the mock and assertions change.

## Positive Signals

### [2026-04-09] Base UI data attribute names correctly verified
Plan correctly used `data-[panel-open]` for the Trigger (which matches `CollapsibleTriggerDataAttributes.panelOpen = "data-panel-open"`) and `data-[starting-style]`/`data-[ending-style]` for panel animation (which match `CollapsiblePanelDataAttributes.startingStyle/endingStyle`). These are real attributes confirmed in the Base UI 1.3.0 type definitions.

### [2026-04-09] Caller analysis accurate for single-file rewrite
Plan correctly identified quiz-config-form.tsx as the only production caller and verified props interface is unchanged. No missed callers in this case.
