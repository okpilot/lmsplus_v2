import { type ClassValue, clsx } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'
import {
  CONTAINERS,
  DURATIONS,
  EASING,
  ELEVATION,
  FIXED_SPACING,
  FONT_WEIGHTS,
  ICON_SPACING_KEYS,
  OPACITY,
  RADIUS_KEYS,
  SIZES,
  SPACING,
  SPACING_ROLES,
  STROKE,
  TRACKING,
  TYPE_ROLES,
  WIDTHS,
  Z_INDEX,
} from './design/scale'

// Teach tailwind-merge the design-token names (text-caption, rounded-card, p-card, ...) so cn() merges them
// as sizes, not colours.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: Object.keys(TYPE_ROLES),
      spacing: [
        ...Object.keys(SPACING),
        ...Object.keys(FIXED_SPACING),
        ...ICON_SPACING_KEYS,
        ...Object.keys(SPACING_ROLES),
        ...Object.keys(SIZES),
      ],
      radius: [...RADIUS_KEYS],
      container: Object.keys(CONTAINERS),
      ease: Object.keys(EASING),
      shadow: Object.keys(ELEVATION),
    },
    classGroups: {
      z: [{ z: Object.keys(Z_INDEX) }],
      'ring-w': [{ ring: Object.keys(WIDTHS.ring) }],
      'ring-offset-w': [{ 'ring-offset': Object.keys(WIDTHS.ringOffset) }],
      'outline-w': [{ outline: Object.keys(WIDTHS.outline) }],
      'border-w': [{ border: Object.keys(WIDTHS.border) }],
      'border-w-x': [{ 'border-x': Object.keys(WIDTHS.border) }],
      'border-w-y': [{ 'border-y': Object.keys(WIDTHS.border) }],
      'border-w-s': [{ 'border-s': Object.keys(WIDTHS.border) }],
      'border-w-e': [{ 'border-e': Object.keys(WIDTHS.border) }],
      'border-w-t': [{ 'border-t': Object.keys(WIDTHS.border) }],
      'border-w-r': [{ 'border-r': Object.keys(WIDTHS.border) }],
      'border-w-b': [{ 'border-b': Object.keys(WIDTHS.border) }],
      'border-w-l': [{ 'border-l': Object.keys(WIDTHS.border) }],
      opacity: [{ opacity: Object.keys(OPACITY) }],
      'stroke-w': [{ stroke: Object.keys(STROKE) }],
      'font-weight': [{ font: Object.keys(FONT_WEIGHTS) }],
      tracking: [{ tracking: Object.keys(TRACKING) }],
      duration: [{ duration: Object.keys(DURATIONS) }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
