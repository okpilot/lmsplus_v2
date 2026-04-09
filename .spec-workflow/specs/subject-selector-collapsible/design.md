# Design — Subject Selector Collapsible Panel

## Visual States

### Collapsed (no selection)
```
┌──────────────────────────────────────────────┐
│  Select a subject                          ▼ │
└──────────────────────────────────────────────┘
```

### Collapsed (subject selected)
```
┌──────────────────────────────────────────────┐
│  [050]  Meteorology    112 questions       ▼ │
└──────────────────────────────────────────────┘
```

### Expanded (selecting)
```
┌──────────────────────────────────────────────┐
│  Select a subject                          ▲ │
├──────────────────────────────────────────────┤
│▌ [010]  Air Law                         124  │  ← selected (blue accent)
│  [021]  Airframe & Systems               58  │
│  [022]  Electrics                        42  │
│  [031]  Mass & Balance                   36  │
│  [032]  Performance                      71  │
│  [033]  Flight Planning                  89  │
│  [040]  Human Performance               95  │
│  [050]  Meteorology                     112  │
│  [061]  General Navigation               78  │
│  [062]  Radio Navigation                 64  │
│  [070]  Operational Procedures           53  │
│  [081]  Principles of Flight             87  │
│  [090]  Communications                   41  │
└──────────────────────────────────────────────┘
```

## Styling Tokens (dark theme)

| Element | Style |
|---------|-------|
| Container border | `rounded-[10px] border border-border` → `border-primary` when open |
| Container bg | `bg-card` (maps to `#18181b`) |
| Trigger padding | `px-4 py-3` |
| Placeholder text | `text-muted-foreground text-sm` |
| Chevron | `lucide ChevronDown`, `h-4 w-4 text-muted-foreground`, rotates 180deg when open |
| Subject row | `px-4 py-2.5 flex items-center gap-2.5` |
| Code badge (inactive) | `font-mono text-xs font-medium bg-muted text-muted-foreground px-1.5 py-0.5 rounded` |
| Code badge (active) | `font-mono text-xs font-semibold bg-primary/15 text-primary px-1.5 py-0.5 rounded` |
| Subject name (inactive) | `text-sm text-muted-foreground` |
| Subject name (active) | `text-sm font-medium text-foreground` |
| Question count | `text-xs text-muted-foreground/50 ml-auto` |
| Active row | `bg-primary/8 border-l-3 border-primary` |
| Hover row | `hover:bg-muted/50` |
| Divider | `border-t border-border` between trigger and list |

## Animation
- Panel height: CSS transition `150ms ease-out` via `--collapsible-panel-height`
- Chevron rotation: `transition-transform duration-150`
- Uses Base UI's `data-starting-style` / `data-ending-style` for smooth enter/exit

## Paper Design Reference
Artboards: "Subject Selector — Collapsed State" and "Subject Selector — Expanded State"
