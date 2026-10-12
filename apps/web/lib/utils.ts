import { type ClassValue, clsx } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'
import { CONTAINERS, EASING, RADIUS_KEYS, SPACING, TYPE_ROLES } from './design/scale'

// Teach tailwind-merge the design-token names (text-caption, rounded-card, p-card, ...) so cn() merges them
// as sizes, not colours.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: Object.keys(TYPE_ROLES),
      spacing: Object.keys(SPACING),
      radius: [...RADIUS_KEYS],
      container: Object.keys(CONTAINERS),
      ease: Object.keys(EASING),
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
