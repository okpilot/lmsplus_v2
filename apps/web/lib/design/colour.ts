import { DARK } from './colour-dark'
import { type ColourName as BaseName, LIGHT } from './colour-light'
import { mixOklch } from './mix'
import { STATE } from './scale'

const FILLS = ['primary', 'secondary', 'destructive', 'caution-solid'] as const
type Fill = (typeof FILLS)[number]
export type ColourName = BaseName | `${Fill}-${'hover' | 'pressed'}` | 'primary-soft'
type Palette = Record<ColourName, string>

const PRIMARY_SOFT_PCT = 10
const STATE_DARK = 'oklch(0.2 0 0)'

function withStates(base: Record<BaseName, string>): Palette {
  const out: Record<string, string> = { ...base }
  for (const fill of FILLS) {
    const overlay = fill === 'secondary' ? base.foreground : STATE_DARK
    out[`${fill}-hover`] = mixOklch(base[fill], overlay, Number.parseFloat(STATE.hover))
    out[`${fill}-pressed`] = mixOklch(base[fill], overlay, Number.parseFloat(STATE.pressed))
  }
  out['primary-soft'] = mixOklch(base.card, base.primary, PRIMARY_SOFT_PCT)
  return out as Palette
}

export const COLOURS: { light: Palette; dark: Palette } = {
  light: withStates(LIGHT),
  dark: withStates(DARK),
}

type AlphaFill = { base: ColourName; pct: number }

/** Translucent state colours: `color-mix(base pct%, transparent)`. Never contrast-checked (decorative or layered). */
export const ALPHA_COLOURS: Record<string, { light: AlphaFill; dark: AlphaFill }> = {
  // aria-invalid:ring-destructive/20, dark:aria-invalid:ring-destructive/40
  'invalid-ring': {
    light: { base: 'destructive', pct: 20 },
    dark: { base: 'destructive', pct: 40 },
  },
  // aria-invalid:border-destructive, dark:aria-invalid:border-destructive/50
  'invalid-border': {
    light: { base: 'destructive', pct: 100 },
    dark: { base: 'destructive', pct: 50 },
  },
  // bg-card, dark:bg-muted/30 (fields)
  'field-fill': { light: { base: 'card', pct: 100 }, dark: { base: 'muted', pct: 30 } },
  // bg-muted/30 (heatmap future cell), both themes
  'data-future': { light: { base: 'muted', pct: 30 }, dark: { base: 'muted', pct: 30 } },
  // disabled:bg-muted/50, dark:disabled:bg-muted/80
  'field-disabled': { light: { base: 'muted', pct: 50 }, dark: { base: 'muted', pct: 80 } },
  // data-unchecked:bg-input, dark:data-unchecked:bg-input/80
  'switch-off': { light: { base: 'input', pct: 100 }, dark: { base: 'input', pct: 80 } },
  // ring-primary/30 (diagram tap list), both themes
  'selected-ring': { light: { base: 'primary', pct: 30 }, dark: { base: 'primary', pct: 30 } },
  // hover:border-primary/40 (answer options), both themes
  'primary-border-hover': {
    light: { base: 'primary', pct: 40 },
    dark: { base: 'primary', pct: 40 },
  },
  // border-primary/60 (diagram tap list), both themes
  'primary-border-soft': {
    light: { base: 'primary', pct: 60 },
    dark: { base: 'primary', pct: 60 },
  },
  // [a]:hover:bg-destructive/20 (badge), both themes
  'danger-soft-hover': {
    light: { base: 'destructive', pct: 20 },
    dark: { base: 'destructive', pct: 20 },
  },
  // bg-background/95 (bottom tab bar, bulk actions bar), both themes
  glass: { light: { base: 'background', pct: 95 }, dark: { base: 'background', pct: 95 } },
  // text-muted-foreground/30 (heatmap future-day label), both themes
  'data-empty': {
    light: { base: 'muted-foreground', pct: 30 },
    dark: { base: 'muted-foreground', pct: 30 },
  },
  // border-foreground/60 (diagram badge), both themes
  'diagram-line': { light: { base: 'foreground', pct: 60 }, dark: { base: 'foreground', pct: 60 } },
  // fill-foreground/85 (runway art), both themes
  'diagram-fill': { light: { base: 'foreground', pct: 85 }, dark: { base: 'foreground', pct: 85 } },
}

type ContrastPair = readonly [fg: ColourName, bg: ColourName, min: 3 | 4.5]

const STATUSES = ['success', 'danger', 'caution', 'info'] as const
const TEXT = 4.5
const NON_TEXT = 3

const statusPairs = STATUSES.flatMap((s): ContrastPair[] => [
  [s, 'background', TEXT],
  [s, 'card', TEXT],
  [s, 'muted', TEXT],
  [s, 'accent', TEXT],
  [s, 'popover', TEXT],
  [s, 'overlay', TEXT],
  [s, `${s}-soft`, TEXT],
  ['foreground', `${s}-soft`, TEXT],
  ['muted-foreground', `${s}-soft`, TEXT],
  [`${s}-foreground`, `${s}-solid`, TEXT],
])

const ON_FILLS = [
  ['primary-foreground', 'primary'],
  ['destructive-foreground', 'destructive'],
  ['caution-foreground', 'caution-solid'],
  ['secondary-foreground', 'secondary'],
] as const

const onStates = ON_FILLS.flatMap(([fg, fill]): ContrastPair[] => [
  [fg, `${fill}-hover`, TEXT],
  [fg, `${fill}-pressed`, TEXT],
])

/** [foreground, background, minimum WCAG ratio] — checked in both themes by tokens-css.test.ts. */
export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  ['foreground', 'background', TEXT],
  ['foreground', 'card', TEXT],
  ['foreground', 'popover', TEXT],
  ['foreground', 'overlay', TEXT],
  ['foreground', 'muted', TEXT],
  ['card-foreground', 'card', TEXT],
  ['popover-foreground', 'popover', TEXT],
  ['secondary-foreground', 'secondary', TEXT],
  ['accent-foreground', 'accent', TEXT],
  ['overlay-foreground', 'overlay', TEXT],
  ['muted-foreground', 'background', TEXT],
  ['muted-foreground', 'card', TEXT],
  ['muted-foreground', 'popover', TEXT],
  ['muted-foreground', 'overlay', TEXT],
  ['muted-foreground', 'muted', TEXT],
  ['primary-text', 'background', TEXT],
  ['primary-text', 'card', TEXT],
  ['primary-text', 'popover', TEXT],
  ['primary-text', 'overlay', TEXT],
  ['primary-text', 'muted', TEXT],
  ['primary-text', 'info-soft', TEXT],
  ['primary-text', 'primary-soft', TEXT],
  ['primary-foreground', 'primary', TEXT],
  ['destructive-foreground', 'destructive', TEXT],
  ...onStates,
  ...statusPairs,
  ['danger', 'caution-soft', TEXT],
  ['input', 'background', NON_TEXT],
  ['input', 'card', NON_TEXT],
  ['input', 'popover', NON_TEXT],
  ['input', 'overlay', NON_TEXT],
  ['input', 'muted', NON_TEXT],
  ['ring', 'background', NON_TEXT],
  ['ring', 'card', NON_TEXT],
  ['data', 'card', NON_TEXT],
  ['data', 'muted', NON_TEXT],
  ['data-strong', 'card', NON_TEXT],
  ['data-strong', 'muted', NON_TEXT],
  ['data-goal', 'card', NON_TEXT],
  ['data-goal', 'muted', NON_TEXT],
  ['series-1', 'card', NON_TEXT],
  ['series-2', 'card', NON_TEXT],
  ['series-3', 'card', NON_TEXT],
  ['series-4', 'card', NON_TEXT],
]
