import { COLOURS } from './colour'
import { oklchToHex } from './contrast'

const L = COLOURS.light

/** Light-theme token colours as `#rrggbb` for email templates (no oklch support in mail clients). */
export const EMAIL_COLOURS = {
  text: oklchToHex(L.foreground),
  muted: oklchToHex(L['muted-foreground']),
  accent: oklchToHex(L.primary),
  'on-accent': oklchToHex(L['primary-foreground']),
  surface: oklchToHex(L.muted),
} as const
