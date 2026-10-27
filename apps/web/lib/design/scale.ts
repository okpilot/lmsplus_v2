import { fluid, rem } from './fluid'

type TypeRole = {
  min: number
  max: number
  lineHeight: number
  weight: 400 | 500 | 600
  tracking: number
}

// Scale B · Balanced. size px [min, max] fluid 360 -> 1240; tracking in em.
export const TYPE_ROLES: Record<string, TypeRole> = {
  display: { min: 40, max: 56, lineHeight: 1.1, weight: 500, tracking: -0.02 },
  title: { min: 24, max: 32, lineHeight: 1.2, weight: 600, tracking: -0.02 },
  heading: { min: 18, max: 22, lineHeight: 1.3, weight: 600, tracking: -0.01 },
  stat: { min: 26, max: 34, lineHeight: 1.1, weight: 600, tracking: -0.02 },
  body: { min: 16, max: 16, lineHeight: 1.5, weight: 400, tracking: 0 },
  label: { min: 15, max: 16, lineHeight: 1.3, weight: 500, tracking: 0 },
  caption: { min: 13, max: 14, lineHeight: 1.4, weight: 400, tracking: 0 },
  overline: { min: 12, max: 12.5, lineHeight: 1.3, weight: 500, tracking: 0.07 },
}

// S2 · Comfortable. [min, max] px, fluid.
export const SPACING: Record<string, readonly [number, number]> = {
  inline: [8, 8],
  stack: [10, 12],
  card: [16, 24],
  cards: [12, 20],
  section: [24, 40],
  gutter: [16, 40],
}

export const CONTAINERS = { content: '70rem', reading: '70ch' } as const

// R2 · Soft.
export const RADIUS = { base: rem(8), control: rem(8), card: rem(12), sheet: rem(16) } as const
export const RADIUS_KEYS = ['control', 'card', 'sheet'] as const

export const Z_INDEX = {
  sticky: 10,
  scrim: 15,
  nav: 20,
  overlay: 30,
  dropdown: 40,
  toast: 50,
  banner: 60,
}

// M2 · Standard (ms).
export const DURATIONS = { fast: 150, base: 200, slow: 300 }
export const EASING = {
  enter: 'cubic-bezier(0.2, 0, 0, 1)',
  exit: 'cubic-bezier(0.3, 0, 1, 1)',
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
}

// O2 · Clear.
export const STATE = { hover: '8%', pressed: '12%' }

// Tap height: 44px below 1024px, 36px from 1024px (64rem).
export const CONTROL_HEIGHT = { phone: '44px', desktop: '36px', desktopFrom: '64rem' }

export const typeSize = (role: TypeRole) => fluid(role.min, role.max)
export const spacingValue = ([min, max]: readonly [number, number]) => fluid(min, max)
