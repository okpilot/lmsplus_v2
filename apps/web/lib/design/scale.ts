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
  'label-strong': { min: 15, max: 16, lineHeight: 1.3, weight: 600, tracking: 0 },
  'caption-strong': { min: 13, max: 14, lineHeight: 1.4, weight: 500, tracking: 0 },
  chip: { min: 12, max: 12.5, lineHeight: 1.3, weight: 500, tracking: 0 },
  question: { min: 16, max: 16, lineHeight: 1.625, weight: 400, tracking: 0 },
  micro: { min: 11, max: 11, lineHeight: 1.2, weight: 400, tracking: 0 },
  chart: { min: 9, max: 9, lineHeight: 1, weight: 400, tracking: 0 },
}

// Desktop step (px) from DESKTOP_FROM; roles not listed do not step.
export const TYPE_DESKTOP = {
  body: 15,
  label: 14,
  'label-strong': 14,
  caption: 13,
  'caption-strong': 13,
  overline: 12,
  chip: 12,
} as const

export const TRACKING = { logo: '-0.055em', code: '0.1em', normal: '0em' } as const

export const FONT_WEIGHTS = { normal: 400, medium: 500, semibold: 600 } as const

// Border, ring and outline widths. Consumed as `ring-focus`, `border-emphasis`, ...
export const WIDTHS = {
  ring: { focus: '2px', select: '2px', surface: '1px' },
  ringOffset: { focus: '2px' },
  outline: { focus: '2px' },
  border: { emphasis: '2px' },
} as const

export const OPACITY = { disabled: '50%' } as const

// Lucide `strokeWidth` for icons.
export const STROKE = { icon: 2, 'icon-bold': 2.5 } as const

// S2 · Comfortable. [min, max] px, fluid.
export const SPACING: Record<string, readonly [number, number]> = {
  inline: [8, 8],
  stack: [10, 12],
  card: [16, 24],
  cards: [12, 20],
  section: [24, 40],
  gutter: [16, 40],
  // Rows and table cells.
  row: [12, 12],
  'cell-y': [10, 10],
  'cell-x': [12, 12],
}

// Role paddings and gaps (px -> rem) -> --spacing-<k>.
export const SPACING_ROLES: Record<string, number> = {
  'dialog-pad': 16,
  'card-sm': 12,
  'prose-indent': 20,
  'field-end': 40,
  'tap-x': 12,
  'tap-y': 8,
  'nav-gap': 28,
  'tab-clear': 96,
  'inset-lg': 64,
  'pad-control-sm': 8,
  'pad-control': 12,
  'pad-control-lg': 16,
  'stack-xs': 4,
  'stack-sm': 8,
  'stack-lg': 16,
}

// Component sizes -> --spacing-<k> (used by h-/w-/size-/min-h-).
export const SIZES = {
  control: 'var(--control-h)',
  'control-sm': '28px',
  'control-lg': '48px',
  chip: '20px',
  avatar: '28px',
  'icon-box': '40px',
  'icon-box-lg': '48px',
  'skeleton-line': '1rem',
  'skeleton-title': '2rem',
  'skeleton-row': '3rem',
  'skeleton-row-lg': '4rem',
  'skeleton-card': '6rem',
  'skeleton-card-lg': '12rem',
  'skeleton-chart': '16rem',
  'skeleton-chart-lg': '24rem',
  'skeleton-w': '12rem',
  'skeleton-w-lg': '16rem',
  'scroll-xs': '8rem',
  'scroll-sm': '12rem',
  'scroll-md': '16rem',
  'field-min': '4rem',
  'slider-v': '10rem',
  'heatmap-cell': '1.875rem',
  'heatmap-cell-md': '2.375rem',
  'heatmap-row': '2.375rem',
  'heatmap-row-md': '2.875rem',
  'heatmap-label': '4.375rem',
  'heatmap-label-md': '7.5rem',
} as const

// Fixed widths (px): session panel, setup column, saved-row progress column.
export const FIXED_SPACING = { rail: '340px', 'setup-rail': '360px', progress: '280px' } as const

// Icon sizes (px) follow the adjacent text: caption, body, sidebar, heading, empty state.
export const ICON_SIZES = { sm: 14, base: 16, nav: 18, lg: 20, xl: 24 } as const
/** Spacing-namespace keys: icon-sm, icon, icon-nav, icon-lg, icon-xl. */
export const ICON_SPACING_KEYS = Object.keys(ICON_SIZES).map((n) =>
  n === 'base' ? 'icon' : `icon-${n}`,
)

// Named max-widths and column minimums. Dialog sizes keep Tailwind's sm / 2xl / md values.
export const CONTAINERS = {
  content: '70rem',
  reading: '70ch',
  field: '28ch',
  dialog: '24rem',
  'dialog-xs': '20rem',
  'dialog-md': '28rem',
  'dialog-wide': '42rem',
  'col-sm': '140px',
  'col-md': '160px',
  'col-lg': '200px',
  'col-xl': '300px',
  'stat-note': '120px',
  'login-note': '220px',
  'question-cell': '400px',
  'col-xs': '80px',
  'col-code': '96px',
  popover: '15rem',
  'popover-sm': '12rem',
  'menu-min': '9rem',
  sidebar: '15rem',
  auth: '25rem',
  'viewport-inset': 'calc(100vw - 2rem)',
} as const

// Layout variables. Grid templates are consumed as `grid-cols-(--layout-*)`.
export const LAYOUT = {
  'layout-setup': 'var(--spacing-setup-rail) minmax(0, 1fr)',
  'layout-setup-rows': 'auto 1fr',
  'layout-session':
    'minmax(0, 1fr) minmax(0, var(--container-reading)) minmax(calc(var(--spacing-rail) + var(--spacing-section)), 1fr)',
  'layout-saved-row': 'minmax(0, 1fr) var(--spacing-progress) auto',
  'session-header-h': '3.375rem',
  'panel-max': 'calc(100dvh - var(--session-header-h) - 2 * var(--spacing-section))',
  'layout-distribution': '1fr 80px 80px',
  'layout-issue-code': '1fr 1fr auto',
  'layout-label-value': 'auto 1fr',
  'layout-squares': 'repeat(auto-fill, minmax(2.25rem, 1fr))',
  'layout-squares-panel': 'repeat(auto-fill, minmax(2rem, 1fr))',
  'layout-rows-fill': 'auto 1fr',
  'layout-rows-media-fill': 'auto auto 1fr',
  'layout-rows-pair': 'auto auto',
  'layout-cols-fill-auto': '1fr auto',
  'layout-banner-row': 'minmax(0, 1fr) auto',
  'dialog-max': 'calc(100% - 2rem)',
  'dialog-max-h': 'calc(100dvh - 2rem)',
  'dialog-scroll-h': '85vh',
  'tab-bar-h': 'calc(3.5rem + env(safe-area-inset-bottom))',
  'pool-bottom': 'calc(1rem + env(safe-area-inset-bottom))',
  'safe-bottom': 'env(safe-area-inset-bottom)',
  'half-screen': '50vh',
  'full-screen-h': '100dvh',
} as const

// R2 · Soft. inner = control radius minus a 4px track padding, minimum 4px; small = 6px chips, zones, menu items.
export const RADIUS = {
  base: rem(8),
  control: rem(8),
  card: rem(12),
  sheet: rem(16),
  inner: rem(4),
  small: rem(6),
  pill: 'calc(infinity * 1px)',
} as const
export const RADIUS_KEYS = ['control', 'card', 'sheet', 'inner', 'small', 'pill'] as const

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

// Elevation: shadow offset/blur px, black alpha %. Scrim: black alpha %.
export const ELEVATION = {
  raised: { y: 4, blur: 12, light: 8, dark: 40 },
  overlay: { y: 12, blur: 32, light: 14, dark: 50 },
} as const
export const SCRIM = { light: 40, dark: 40 } as const

// O2 · Clear.
export const STATE = { hover: '8%', pressed: '12%' }

// Tap height: 44px below 1024px, 36px from 1024px (64rem).
export const DESKTOP_FROM = '64rem'
export const CONTROL_HEIGHT = { phone: '44px', desktop: '36px' }

// `md` and `2xl` stay stock until the namespace reset (PR 23).
export const BREAKPOINTS = { sm: '40rem', lg: DESKTOP_FROM, tiny: '23.4375rem' } as const

export const typeSize = (role: TypeRole) => fluid(role.min, role.max)
export const spacingValue = ([min, max]: readonly [number, number]) => fluid(min, max)
