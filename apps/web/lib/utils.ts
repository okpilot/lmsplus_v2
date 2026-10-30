import { type ClassValue, clsx } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'
import {
  CONTAINERS,
  DURATIONS,
  EASING,
  FIXED_SPACING,
  ICON_SPACING_KEYS,
  RADIUS_KEYS,
  SPACING,
  TYPE_ROLES,
  Z_INDEX,
} from './design/scale'

// Teach tailwind-merge the design-token names (text-caption, rounded-card, p-card, ...) so cn() merges them
// as sizes, not colours.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: Object.keys(TYPE_ROLES),
      spacing: [...Object.keys(SPACING), ...Object.keys(FIXED_SPACING), ...ICON_SPACING_KEYS],
      radius: [...RADIUS_KEYS],
      container: Object.keys(CONTAINERS),
      ease: Object.keys(EASING),
      shadow: ['raised', 'overlay'],
    },
    classGroups: {
      z: [{ z: Object.keys(Z_INDEX) }],
      duration: [{ duration: Object.keys(DURATIONS) }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
