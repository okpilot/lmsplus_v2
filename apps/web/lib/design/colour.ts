import { DARK } from './colour-dark'
import { type ColourName, LIGHT } from './colour-light'

export type { ColourName }
export const COLOURS: { light: Record<ColourName, string>; dark: Record<ColourName, string> } = {
  light: LIGHT,
  dark: DARK,
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
  [s, `${s}-soft`, TEXT],
  [`${s}-foreground`, `${s}-solid`, TEXT],
])

/** [foreground, background, minimum WCAG ratio] — checked in both themes by tokens-css.test.ts. */
export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  ['foreground', 'background', TEXT],
  ['foreground', 'card', TEXT],
  ['foreground', 'popover', TEXT],
  ['foreground', 'overlay', TEXT],
  ['foreground', 'muted', TEXT],
  ['overlay-foreground', 'overlay', TEXT],
  ['muted-foreground', 'background', TEXT],
  ['muted-foreground', 'card', TEXT],
  ['muted-foreground', 'popover', TEXT],
  ['muted-foreground', 'overlay', TEXT],
  ['muted-foreground', 'muted', TEXT],
  ['primary-text', 'background', TEXT],
  ['primary-text', 'card', TEXT],
  ['primary-foreground', 'primary', TEXT],
  ['destructive-foreground', 'destructive', TEXT],
  ...statusPairs,
  ['input', 'background', NON_TEXT],
  ['input', 'card', NON_TEXT],
  ['input', 'popover', NON_TEXT],
  ['input', 'overlay', NON_TEXT],
  ['input', 'muted', NON_TEXT],
  ['ring', 'background', NON_TEXT],
  ['ring', 'card', NON_TEXT],
  ['data', 'card', NON_TEXT],
  ['data-strong', 'card', NON_TEXT],
  ['data-strong', 'muted', NON_TEXT],
  ['data-goal', 'card', NON_TEXT],
  ['series-1', 'card', NON_TEXT],
  ['series-2', 'card', NON_TEXT],
  ['series-3', 'card', NON_TEXT],
  ['series-4', 'card', NON_TEXT],
]
