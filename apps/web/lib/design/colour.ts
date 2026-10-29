import { DARK } from './colour-dark'
import { type ColourName as BaseName, LIGHT } from './colour-light'
import { mixOklch } from './mix'
import { STATE } from './scale'

const FILLS = ['primary', 'secondary', 'destructive', 'caution-solid'] as const
type Fill = (typeof FILLS)[number]
export type ColourName = BaseName | `${Fill}-${'hover' | 'pressed'}`
type Palette = Record<ColourName, string>

const STATE_DARK = 'oklch(0.2 0 0)'

function withStates(base: Record<BaseName, string>): Palette {
  const out: Record<string, string> = { ...base }
  for (const fill of FILLS) {
    const overlay = fill === 'secondary' ? base.foreground : STATE_DARK
    out[`${fill}-hover`] = mixOklch(base[fill], overlay, Number.parseFloat(STATE.hover))
    out[`${fill}-pressed`] = mixOklch(base[fill], overlay, Number.parseFloat(STATE.pressed))
  }
  return out as Palette
}

export const COLOURS: { light: Palette; dark: Palette } = {
  light: withStates(LIGHT),
  dark: withStates(DARK),
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
