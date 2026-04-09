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
│  [050]  Meteorology                        ▼ │
└──────────────────────────────────────────────┘
```

### Expanded (selecting)
```
┌──────────────────────────────────────────────┐
│  Select a subject                          ▲ │
├──────────────────────────────────────────────┤
│▌ [010]  Air Law                              │  ← selected (blue accent)
│  [021]  Airframe & Systems                   │
│  [022]  Electrics                            │
│  [031]  Mass & Balance                       │
│  [032]  Performance                          │
│  [033]  Flight Planning                      │
│  [040]  Human Performance                    │
│  [050]  Meteorology                          │
│  [061]  General Navigation                   │
│  [062]  Radio Navigation                     │
│  [070]  Operational Procedures               │
│  [081]  Principles of Flight                 │
│  [090]  Communications                       │
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
| Active row | `bg-primary/8 border-l-3 border-primary` |
| Hover row | `hover:bg-muted/50` |
| Divider | `border-t border-border` between trigger and list |

## Animation
- Panel height: CSS transition `150ms ease-out` via `--collapsible-panel-height`
- Chevron rotation: `transition-transform duration-150`
- Uses Base UI's `data-starting-style` / `data-ending-style` for smooth enter/exit

## Paper Design Reference
Artboards: "Subject Selector — Collapsed State" and "Subject Selector — Expanded State"
