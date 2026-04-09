# Requirements — Subject Selector Collapsible Panel

## Summary
Replace the shadcn `Select` dropdown on the quiz setup page with an inline collapsible panel that expands/collapses in place, pushing page content down rather than overlaying it.

## GitHub Issue
- #414 — Replace subject dropdown with carousel/chip selector on quiz setup page

## Problem
The current `Select` dropdown overlays other UI elements when opened, creating a poor visual experience especially on mobile. The popup covers form elements and feels out of place.

## Solution
An inline collapsible panel using Base UI's `Collapsible` primitive (already installed as shadcn component). The panel:
- **Collapsed**: Shows a single bar with the selected subject (code badge + name) and a chevron
- **Expanded**: Opens inline, pushing Mode/Filter/Topics sections down, showing all subjects as a list
- **Selection**: Clicking a subject selects it and collapses the panel
- **Animation**: Smooth height transition using `--collapsible-panel-height` CSS var

## Functional Requirements
1. Clicking the collapsed bar toggles the panel open
2. Clicking a subject row selects it and closes the panel
3. Selected subject shows with blue highlight (left border accent + tinted background)
4. Each row displays: code badge and subject name
5. The chevron rotates between down (collapsed) and up (expanded)
6. When no subject is selected, the bar shows "Select a subject" placeholder text
7. The `onValueChange` callback interface remains identical to the current `SubjectSelect`
8. Content below (Mode, Filter, Topics, Start button) pushes down smoothly when expanded

## Non-Functional Requirements
1. Works on both desktop and mobile without z-index or overlay issues
2. Smooth CSS transition on expand/collapse (~150ms)
3. Accessible: keyboard navigable, proper ARIA from Base UI Collapsible
4. Matches existing dark theme styling conventions (rounded-[10px], border-border, etc.)

## Out of Scope
- No changes to `useQuizConfig`, `quiz-config-handlers`, or `getSubjectsWithCounts()`
- No changes to the data flow (Server Component -> Client Component props)
- No new dependencies (Base UI Collapsible already installed)

## Design Reference
Paper Design artboards:
- "Subject Selector — Collapsed State"
- "Subject Selector — Expanded State"
