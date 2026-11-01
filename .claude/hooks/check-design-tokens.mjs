#!/usr/bin/env node
// Mechanical guard (#1433 / #1677 PR B): every Tailwind class in apps/web source is a design token.
// Scans string and template literals, className attributes and CSS @apply lists for class tokens and reports rules R1..R12:
//   R1  numeric spacing/sizing step outside the step allowlist (p m gap space inset top right
//       bottom left start end translate w h size min-w|h max-w|h basis scroll-m|p indent border-spacing)
//   R2  `inline` / `row` role name on a spacing utility
//   R3  `z-<n>`
//   R4  border / ring / ring-offset / inset-ring / outline / outline-offset / divide-x|y / stroke
//       width >= 1, `ring-inset`
//   R5  `opacity-<n>` other than 0, 100, disabled
//   R6  `/modifier` on a colour utility, except a numeric name fraction, a `/(--var)` whose variable
//       tokens.css declares as a percentage, and a gradient interpolation word on bg-linear|radial|conic
//   R7  arbitrary `[...]` values and `min-[...]` / `max-[...]` variants
//   R8  stock names of cleared namespaces (colour hues, font-weight, tracking, breakpoints md/xl/2xl,
//       shadow / inset-shadow / drop-shadow / text-shadow), derived from Tailwind's theme stylesheet minus
//       apps/web/app/tokens.css. Fails closed (exit 2) when either file is missing.
//   R9  named radius, bare rounded, arbitrary rounded-[ and size-[ values, named max-w, leading or
//       trailing `!` important, Tailwind default text sizes, arbitrary text sizes
//   R10 native `title=` on a lowercase DOM element
//   R11 numeric `strokeWidth` outside diagrams/** and score-ring.tsx
//   R12 hex colour in lib/email/**
//
// R8 hues are re-derived here exactly as `stockColourHues` in apps/web/lib/design/build-tokens-css.ts
// does (every `--color-<hue>-50` in Tailwind's resolved theme stylesheet): that module is TypeScript with
// extensionless imports and cannot be imported by plain node.
//
// Quoted ('' and "") literals that read as prose (a word starting uppercase or ending . , ? ; or an HTML
// tag) are not graded as class lists; template literals, className attributes and @apply lists always are.
//
// Known limits: untyped `-(--var)` references are not checked; allowlist entries are file+class without a
// count; `--staged` reads tokens.css from the working tree (CI's whole-tree run grades committed content);
// a stray backtick in a comment or a nested template literal may hide literals; an apostrophe in JSX text
// may pair with a later quote on the same line and hide literals.
//
// Usage:
//   node .claude/hooks/check-design-tokens.mjs --staged <file...>   scan the INDEX content of the given files; an unresolvable entry exits 2; no files exits 0
//   node .claude/hooks/check-design-tokens.mjs <file...>   scan the given files from the working tree
//   node .claude/hooks/check-design-tokens.mjs             whole tree; also fails on a stale allowlist entry
//   node .claude/hooks/check-design-tokens.mjs --report    per-family counts outside the allowlist, exit 0
// Exit: 0 clean, 1 violations, 2 cannot run (fail closed).

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { argv, exit } from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPO = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const TOKENS_CSS = join(REPO, 'apps/web/app/tokens.css')
const SCAN_ROOTS = ['app', 'components', 'lib'].map((d) => join(REPO, 'apps/web', d))

const FAMILIES = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R10', 'R11', 'R12']

/**
 * Entries keyed by file + class token. `owner` names who removes it; a temporary entry carries the
 * issue that migrates the site. Whole-tree mode fails when an entry no longer matches a violation.
 */
export const ALLOWLIST = [
  {
    file: 'apps/web/components/ui/sonner.tsx',
    class: 'max-w-[min(var(--width),calc(100vw-2rem))]!',
    reason:
      'sonner injects unlayered CSS; the toast width must be clamped with !important and sonner --width',
    owner: 'permanent',
  },
  {
    file: 'apps/web/components/ui/sonner.tsx',
    class: 'w-fit!',
    reason: 'sonner injects unlayered CSS; the toast override needs !important',
    owner: 'permanent',
  },
  {
    file: 'apps/web/components/ui/sonner.tsx',
    class: 'gap-2!',
    reason: 'sonner injects unlayered CSS; the toast override needs !important',
    owner: 'permanent',
  },
  {
    file: 'apps/web/components/ui/sonner.tsx',
    class: 'border-success-solid!',
    reason: 'sonner injects unlayered CSS; the toast override needs !important',
    owner: 'permanent',
  },
  {
    file: 'apps/web/components/ui/sonner.tsx',
    class: 'border-danger-solid!',
    reason: 'sonner injects unlayered CSS; the toast override needs !important',
    owner: 'permanent',
  },
  {
    file: 'apps/web/components/ui/sonner.tsx',
    class: 'border-caution-solid!',
    reason: 'sonner injects unlayered CSS; the toast override needs !important',
    owner: 'permanent',
  },
  {
    file: 'apps/web/components/ui/sonner.tsx',
    class: 'border-info-solid!',
    reason: 'sonner injects unlayered CSS; the toast override needs !important',
    owner: 'permanent',
  },
  {
    file: 'apps/web/components/ui/sonner.tsx',
    class: 'z-toast!',
    reason: 'sonner injects unlayered CSS; the toast override needs !important',
    owner: 'permanent',
  },
  {
    file: 'apps/web/components/ui/switch.tsx',
    class: 'data-[size=default]:h-4.5',
    reason: 'switch thumb/track geometry is intrinsic to the control, not a layout step',
    owner: 'permanent',
  },
  {
    file: 'apps/web/components/ui/switch.tsx',
    class: 'data-[size=sm]:h-3.5',
    reason: 'switch thumb/track geometry is intrinsic to the control, not a layout step',
    owner: 'permanent',
  },
  {
    file: 'apps/web/components/ui/switch.tsx',
    class: 'group-data-[size=default]/switch:data-checked:translate-x-3.5',
    reason: 'switch thumb/track geometry is intrinsic to the control, not a layout step',
    owner: 'permanent',
  },
  {
    file: 'apps/web/app/app/_components/answer-options.tsx',
    class: 'size-7',
    reason: 'raw step with a token equivalent; migrated by PR C',
    owner: '#1677 lock-3',
  },
  {
    file: 'apps/web/app/app/_components/more-sheet.tsx',
    class: 'h-11',
    reason: 'raw step with a token equivalent; migrated by PR C',
    owner: '#1677 lock-3',
  },
  {
    file: 'apps/web/app/app/_components/phone-top-bar.tsx',
    class: 'h-12',
    reason: 'raw step with a token equivalent; migrated by PR C',
    owner: '#1677 lock-3',
  },
  {
    file: 'apps/web/app/app/_components/user-chip.tsx',
    class: 'w-20',
    reason: 'raw step with a token equivalent; migrated by PR C',
    owner: '#1677 lock-3',
  },
  {
    file: 'apps/web/app/app/admin/students/_components/student-table.tsx',
    class: 'w-36',
    reason: 'raw step with a token equivalent; migrated by PR C',
    owner: '#1677 lock-3',
  },
  {
    file: 'apps/web/app/app/internal-exam/_components/my-reports-tab.tsx',
    class: 'w-16',
    reason: 'raw step with a token equivalent; migrated by PR C',
    owner: '#1677 lock-3',
  },
  {
    file: 'apps/web/app/app/progress/_components/subject-breakdown.tsx',
    class: 'w-16',
    reason: 'raw step with a token equivalent; migrated by PR C',
    owner: '#1677 lock-3',
  },
  {
    file: 'apps/web/app/app/quiz/_components/question-filter-toggles.tsx',
    class: 'max-w-60',
    reason: 'raw step with a token equivalent; migrated by PR C',
    owner: '#1677 lock-3',
  },
  {
    file: 'apps/web/app/app/quiz/_components/topic-row.tsx',
    class: 'w-7',
    reason: 'raw step with a token equivalent; migrated by PR C',
    owner: '#1677 lock-3',
  },
  {
    file: 'apps/web/app/app/quiz/session/_components/diagram-tap-list.tsx',
    class: 'min-h-12',
    reason: 'raw step with a token equivalent; migrated by PR C',
    owner: '#1677 lock-3',
  },
  {
    file: 'apps/web/components/ui/button-variants.ts',
    class: 'size-7',
    reason: 'raw step with a token equivalent; migrated by PR C',
    owner: '#1677 lock-3',
  },
  {
    file: 'apps/web/components/ui/empty.tsx',
    class: 'size-12',
    reason: 'raw step with a token equivalent; migrated by PR C',
    owner: '#1677 lock-3',
  },
  {
    file: 'apps/web/components/ui/input.tsx',
    class: 'h-7',
    reason: 'raw step with a token equivalent; migrated by PR C',
    owner: '#1677 lock-3',
  },
  {
    file: 'apps/web/components/ui/slider.tsx',
    class: 'data-vertical:min-h-40',
    reason: 'raw step with a token equivalent; migrated by PR C',
    owner: '#1677 lock-3',
  },
  {
    file: 'apps/web/app/app/loading.tsx',
    class:
      '[animation:look-appear_var(--transition-duration-base)_var(--ease-enter)_400ms_forwards]',
    reason: 'no Tailwind animation utility takes token duration + easing + delay',
    owner: 'permanent',
  },
  {
    file: 'apps/web/app/app/quiz/session/_components/diagram-tap-list.tsx',
    class: '[scrollbar-width:none]',
    reason: 'no Tailwind utility for scrollbar-width',
    owner: 'permanent',
  },
]

// ------------------------------------------------------------------ derived vocabulary

class FailClosed extends Error {}

function readRequired(path, label) {
  if (!existsSync(path)) throw new FailClosed(`${label} not found at ${path}`)
  return readFileSync(path, 'utf8').replace(/\r/g, '')
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const names = (css, re) => new Set([...css.matchAll(re)].map((m) => m[1]))
const minus = (a, b) => [...a].filter((x) => !b.has(x))

/** A detached worktree has no node_modules: fall back to the main checkout that owns this repo. */
function resolveThemePath() {
  const roots = [REPO]
  const common = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
    cwd: REPO,
    encoding: 'utf8',
  })
  if (common.status === 0 && common.stdout.trim()) roots.push(dirname(common.stdout.trim()))
  for (const root of roots) {
    try {
      return createRequire(join(root, 'apps/web/package.json')).resolve('tailwindcss/theme.css')
    } catch {}
  }
  throw new FailClosed('tailwindcss/theme.css could not be resolved from apps/web')
}

export function loadVocabulary() {
  const themePath = resolveThemePath()
  const theme = readRequired(themePath, 'tailwindcss/theme.css')
  const tokens = readRequired(TOKENS_CSS, 'apps/web/app/tokens.css')
  const decl = (prefix) => new RegExp(`^\\s*--${prefix}-([a-z0-9]+):`, 'gm')
  const stock = (prefix) => minus(names(theme, decl(prefix)), names(tokens, decl(prefix)))
  const hues = [...names(theme, /--color-([a-z]+)-50\s*:/g)]
  const vocab = {
    hues,
    weights: stock('font-weight'),
    tracking: stock('tracking'),
    breakpoints: stock('breakpoint'),
    shadow: stock('shadow'),
    insetShadow: stock('inset-shadow'),
    dropShadow: stock('drop-shadow'),
    textShadow: stock('text-shadow'),
    textRoles: names(tokens, /--text-([a-z0-9]+(?:-[a-z0-9]+)*):/g),
    alphaVars: new Set(
      [...tokens.matchAll(/^\s*--([a-z0-9]+(?:-[a-z0-9]+)*)\s*:([^;]*);/gm)]
        .filter((d) => /^\d+(?:\.\d+)?%$/.test(d[2].trim()))
        .map((d) => d[1]),
    ),
  }
  for (const [k, v] of Object.entries(vocab)) {
    if (v.length === 0 || v.size === 0) throw new FailClosed(`derived vocabulary "${k}" is empty`)
  }
  return vocab
}

const alt = (list) => `(?:${[...list].map(escapeRe).join('|')})`

function buildMatchers(v) {
  return {
    hue: new RegExp(`(?:^|-)${alt(v.hues)}-(?:50|[1-9]00|950)$`),
    weight: new RegExp(`^font-${alt(v.weights)}$`),
    tracking: new RegExp(`^tracking-${alt(v.tracking)}$`),
    shadow: new RegExp(`^shadow-${alt(v.shadow)}$`),
    insetShadow: new RegExp(`^inset-shadow-${alt(v.insetShadow)}$`),
    dropShadow: new RegExp(`^drop-shadow-${alt(v.dropShadow)}$`),
    textShadow: new RegExp(`^text-shadow-${alt(v.textShadow)}$`),
    breakpoint: new RegExp(`^(?:max-|min-)?${alt(v.breakpoints)}$`),
    textRoles: v.textRoles,
    alphaVars: v.alphaVars,
  }
}

// ------------------------------------------------------------------ rules

const STEPS = new Set(['0', '0.5', '1', '1.5', '2', '2.5', '3', '4', '5', '6', '8', '10'])
const SPACING_PREFIX =
  '(?:p[xytrblse]?|m[xytrblse]?|gap(?:-[xy])?|space-[xy]|inset(?:-[xy])?|top|right|bottom|left|start|end|translate(?:-[xyz])?|w|h|size|min-[wh]|max-[wh]|basis|scroll-[mp][xytrblse]?|indent|border-spacing(?:-[xy])?)'
const R1_RE = new RegExp(`^(${SPACING_PREFIX})-(\\d+(?:\\.\\d+)?)$`)
const R2_RE = /^(?:p[xytrblse]?|m[xytrblse]?|gap(?:-[xy])?|space(?:-[xy])?)-(?:inline|row)$/
const R4_RE =
  /^(?:border(?:-[xytblrse])?|ring|ring-offset|inset-ring|outline|outline-offset|divide-[xy]|stroke)-(\d+)$/
const OPACITY_OK = new Set(['0', '100', 'disabled'])
const COLOUR_PREFIX =
  /^(?:bg|text|border(?:-[xytblrse])?|ring|ring-offset|outline|fill|stroke|from|via|to|shadow|inset-shadow|inset-ring|drop-shadow|text-shadow|divide|decoration|accent|caret|placeholder)-/
const MODIFIER_RE = /^([a-z][\w-]*)\/([\w.-]+|\[[^\]]*\]|\([^)]*\))$/
const GRADIENT_PREFIX = /^bg-(?:linear|radial|conic)(?:-|$)/
const GRADIENT_INTERP = /^(?:srgb|hsl|oklab|oklch|longer|shorter|increasing|decreasing)$/

// R9: ported from the retired layout-guard and type-size-guard tests. Their arbitrary-value rule is R7.
const R9_RULES = [
  /(?<![\w-])(?:[a-z-]+:)*rounded(?:-[trblse]{1,2})?-(?:xs|sm|md|lg|xl|2xl|3xl|4xl|full)(?![\w-])/,
  /(?<![\w-])(?:[a-z-]+:)*rounded(?![\w-])/,
  /(?<![\w-])(?:[a-z-]+:)*rounded(?:-[trblse]{1,2})?-\[/,
  /(?<![\w-])(?:[a-z-]+:)*max-w-(?:3xs|2xs|xs|sm|md|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|prose)(?![\w-])/,
  /(?<![\w-])(?:[a-z-]+:)*size-\[/,
  /(?<![\w-])(?:[a-z-]+:)*text-(?:xs|sm|base|lg|xl|[2-9]xl)(?![\w-])/,
  /(?<![\w-])(?:[a-z-]+:)*text-\[(?:\d|\.|length:)/,
]

/** Split `variant:variant:base` at bracket depth 0. */
function splitVariants(token) {
  const variants = []
  let depth = 0
  let start = 0
  for (let i = 0; i < token.length; i++) {
    const c = token[i]
    if (c === '[' || c === '(') depth++
    else if (c === ']' || c === ')') depth--
    else if (c === ':' && depth === 0) {
      variants.push(token.slice(start, i))
      start = i + 1
    }
  }
  return { variants, base: token.slice(start) }
}

/** @returns {{ rule: string, why: string }[]} for one class token. */
export function classifyToken(token, m) {
  const out = []
  const flag = (rule, why) => out.push({ rule, why })
  const { variants, base: rawBase } = splitVariants(token)
  const base = rawBase.replace(/^!/, '').replace(/!$/, '').replace(/^-/, '')

  for (const re of R9_RULES) if (re.test(token)) flag('R9', 'raw scale value or default size')
  if (/^![a-z[(]|[\w\])%]!$/.test(rawBase)) flag('R9', 'important modifier')

  const r1 = R1_RE.exec(base)
  if (r1 && !STEPS.has(r1[2])) flag('R1', `step ${r1[2]} is outside the allowlist`)
  if (R2_RE.test(base)) flag('R2', 'role name on a spacing utility')
  if (/^z-\d+$/.test(base)) flag('R3', 'numeric z-index')
  const r4 = R4_RE.exec(base)
  if (r4 && Number(r4[1]) >= 1) flag('R4', 'numeric border/ring/outline width')
  if (base === 'ring-inset') flag('R4', 'ring-inset')
  const op = /^opacity-(.+)$/.exec(base)
  if (op && !OPACITY_OK.has(op[1])) flag('R5', 'opacity outside 0, 100, disabled')

  const mod = MODIFIER_RE.exec(base)
  if (mod && COLOUR_PREFIX.test(mod[1])) {
    const rest = mod[1].replace(COLOUR_PREFIX, '')
    const textRole = mod[1].startsWith('text-') && m.textRoles.has(rest)
    // A text role carries its own line height; any `/` modifier on it is redundant.
    if (textRole) flag('R6', 'line-height modifier on a text role')
    else if (
      !/^\d+(?:\.\d+)?$/.test(rest) &&
      !m.alphaVars.has(/^\(--(.+)\)$/.exec(mod[2])?.[1] ?? '') &&
      !(GRADIENT_PREFIX.test(mod[1]) && GRADIENT_INTERP.test(mod[2]))
    )
      flag('R6', 'colour opacity modifier')
  }

  if (/^[a-z][\w-]*-\[/.test(base)) flag('R7', 'arbitrary value')
  if (/^[a-z][\w-]*-\([a-z-]+:--/.test(base)) flag('R7', 'typed arbitrary value')
  if (/^\[[a-z-]+:[^\]]+\]$/.test(base)) flag('R7', 'arbitrary property')
  if (variants.some((v) => /^(?:min|max)-\[/.test(v))) flag('R7', 'arbitrary breakpoint variant')

  const bare = base.replace(/\/.+$/, '')
  if (
    m.hue.test(bare) ||
    m.weight.test(bare) ||
    m.tracking.test(bare) ||
    m.shadow.test(bare) ||
    m.insetShadow.test(bare) ||
    m.dropShadow.test(bare) ||
    m.textShadow.test(bare)
  ) {
    flag('R8', 'stock name of a cleared namespace')
  }
  if (variants.some((v) => m.breakpoint.test(v))) flag('R8', 'stock breakpoint variant')
  return out
}

// ------------------------------------------------------------------ scanning

// Template literals may span lines; '' and "" strings may not.
const QUOTED = /(["'])((?:(?!\1)[^\n])*)\1|`([^`]*)`/g
/** A quoted literal that reads as English or markup rather than a class list. */
function isProse(body) {
  if (/<[A-Za-z/]/.test(body)) return true
  return body.split(/\s+/).some((w) => /^[A-Z]/.test(w) || /[.,?;]$/.test(w))
}

const TRIM = /^[\s'"`${},;?]+|[\s'"`${},;?:]+$/g

function lineAt(text, index) {
  let n = 1
  for (let i = text.indexOf('\n'); i !== -1 && i < index; i = text.indexOf('\n', i + 1)) n++
  return n
}

/** Opening tags of lowercase DOM elements carrying a depth-0 `title=` attribute. */
function nativeTitleSites(text) {
  const sites = []
  for (const open of text.matchAll(/<([a-z][a-z0-9]*)(?=[\s/>])/g)) {
    if (open[1] === 'iframe') continue
    // `a<b` and `f<T>(x)` are not tags; `text <abbr` is, so a word before whitespace does not skip.
    let k = open.index - 1
    while (k >= 0 && /\s/.test(text[k])) k--
    const spaced = k < open.index - 1
    const prev = k >= 0 ? text[k] : ''
    if (/[)\]]/.test(prev) || (!spaced && /\w/.test(prev))) continue
    let depth = 0
    let quote = ''
    let attrs = ''
    for (let i = open.index + open[0].length; i < text.length; i++) {
      const c = text[i]
      if (quote) {
        if (c === '\\') i++
        else if (c === quote) quote = ''
        continue
      }
      if (c === '{') depth++
      else if (c === '}') depth--
      else if (depth === 0 && (c === '"' || c === "'")) quote = c
      else if (depth === 0 && c === '>') break
      else if (
        depth === 0 &&
        (c === ';' || c === ')' || c + text[i + 1] === '&&' || c + text[i + 1] === '||')
      ) {
        attrs = ''
        break
      } else if (depth === 0) attrs += c
    }
    if (/\stitle\s*=/.test(attrs)) sites.push(open.index)
  }
  return sites
}

const CLASS_EXPR = /\b(?:className|class)\s*=\s*\{/g

/** Index of the `}` closing a `{` whose body starts at `i`, or -1. Braces inside quotes are ignored. */
function balancedEnd(text, i) {
  let depth = 1
  let quote = ''
  for (; i < text.length; i++) {
    const c = text[i]
    if (quote) {
      if (c === '\\') i++
      else if (c === quote) quote = ''
    } else if (c === '"' || c === "'" || c === '`') quote = c
    else if (c === '{') depth++
    else if (c === '}' && --depth === 0) return i
  }
  return -1
}

const CLASS_ATTR =
  /\b(?:className|class)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*(?:'([^']*)'|"([^"]*)"|`([^`]*)`)\s*\})/g
const APPLY = /@apply\s+([^;}]*)/g
const HEX = /(?<![\w&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g
const HEX_ONLY = /^#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})$/
const HEX_CONTEXT =
  /(?:[:=]\s*["']?\s*|(?:color|background|border)[\w-]*\s*:[^;]*|[(,]\s*|(?:\d|px|r?em|%)\s+)$/i

/** Class-list segments of a source file as `{ body, start }`: literals, class attributes, or @apply lists. */
function* segments(text, rel) {
  if (rel.endsWith('.css')) {
    for (const a of text.matchAll(APPLY)) yield { body: a[1], start: a.index + a[0].indexOf(a[1]) }
    return
  }
  for (const lit of text.matchAll(QUOTED)) {
    const body = lit[2] ?? lit[3] ?? ''
    yield {
      body,
      start: lit.index + lit[0].indexOf(body),
      literal: true,
      quoted: lit[1] !== undefined,
    }
  }
  for (const attr of text.matchAll(CLASS_ATTR)) {
    const body = attr.slice(1).find((g) => g !== undefined) ?? ''
    yield { body, start: attr.index + attr[0].indexOf(body) }
  }
  // Literals inside a `className={…}` expression, read from the balanced expression alone so that
  // an apostrophe in surrounding JSX text cannot pair with a quote inside it.
  for (const open of text.matchAll(CLASS_EXPR)) {
    const from = open.index + open[0].length
    const end = balancedEnd(text, from)
    if (end === -1) continue
    for (const lit of text.slice(from, end).matchAll(QUOTED)) {
      const body = lit[2] ?? lit[3] ?? ''
      yield { body, start: from + lit.index + lit[0].indexOf(body) }
    }
  }
}

/** @returns {{ line: number, rule: string, cls: string, why: string }[]} (allowlist NOT applied) */
export function analyze(source, rel, m) {
  const text = source.replace(/\r/g, '')
  const hits = []
  const seenAt = new Set()
  const add = (index, rule, cls, why) => {
    const key = `${rule}:${index}`
    if (seenAt.has(key)) return
    seenAt.add(key)
    hits.push({ line: lineAt(text, index), rule, cls, why })
  }

  for (const { body, start, literal, quoted } of segments(text, rel)) {
    const prose = quoted === true && isProse(body)
    for (const tok of prose ? [] : body.matchAll(/\S+/g)) {
      const cls = tok[0].replace(TRIM, '')
      if (cls === '' || cls === '!important') continue
      for (const { rule, why } of classifyToken(cls, m)) add(start + tok.index, rule, cls, why)
    }
    if (literal && rel.startsWith('apps/web/lib/email/')) {
      for (const hex of body.matchAll(HEX)) {
        const before = body.slice(0, hex.index)
        if (HEX_ONLY.test(body.trim()) || HEX_CONTEXT.test(before)) {
          add(start + hex.index, 'R12', hex[0], 'hex colour in email code')
        }
      }
    }
  }

  for (const index of nativeTitleSites(text)) add(index, 'R10', 'title=', 'native title tooltip')

  if (!/\/diagrams\/|score-ring\.tsx$/.test(rel)) {
    const re =
      /\bstrokeWidth\s*(?:=\s*(?:\{[^}]*(?<![\w$.])\d[^}]*\}|(["'])-?\d[\d.]*\1)|:\s*-?\d)/g
    for (const s of text.matchAll(re))
      add(s.index, 'R11', s[0].replace(/\s+/g, ''), 'numeric strokeWidth')
  }
  return hits
}

/** Repo-relative `apps/web/...` path when `path` is a scanned source file, else null. */
export function scopedRel(path) {
  const p = path.replace(/\\/g, '/')
  const root = `${REPO.replace(/\\/g, '/')}/`
  const sub = p.startsWith(root) ? p.slice(root.length) : p
  if (/(?:^|\/)(?:node_modules|\.next)\//.test(sub) || sub.startsWith('.claude/worktrees/'))
    return null
  const hit = /(?:^|\/)(apps\/web\/(?:app|components|lib)\/.+)$/.exec(p)
  if (!hit) return null
  const rel = hit[1]
  if (!/\.(?:ts|tsx|css)$/.test(rel) || rel === 'apps/web/app/tokens.css') return null
  if (/\.(?:test|spec)\.(?:ts|tsx)$/.test(rel)) return null
  if (/\/e2e\/|\/scripts\//.test(rel)) return null
  return rel
}

/**
 * Read a path's INDEX content, the way the file-size guard does: `cat-file --batch` takes the
 * spec on stdin and exits 0 with `<spec> missing` for an absent entry, so the header is checked.
 * Throws when the entry does not resolve to a blob — the caller fails closed.
 */
function readIndexBlob(path) {
  const out = execFileSync('git', ['cat-file', '--batch'], {
    input: Buffer.concat([Buffer.from(':'), Buffer.from(path), Buffer.from([0x0a])]),
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  const nl = out.indexOf(0x0a)
  const header = nl === -1 ? out.toString('utf8') : out.subarray(0, nl).toString('utf8')
  const blob = header.match(/ blob (\d+)$/)
  if (!blob) throw new Error(`no staged blob: ${header}`)
  return out.subarray(nl + 1, nl + 1 + Number(blob[1])).toString('utf8')
}

function walk(dir, acc) {
  if (!existsSync(dir)) return
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, acc)
    else acc.push(full)
  }
}

function collect(args, staged) {
  const paths = []
  // Staged paths are index entries, so a missing working-tree file is not a reason to drop one.
  if (args.length > 0) paths.push(...(staged ? args : args.filter((p) => existsSync(p))))
  else for (const root of SCAN_ROOTS) walk(root, paths)
  return paths.flatMap((p) => {
    const rel = scopedRel(p)
    return rel ? [{ path: p, rel }] : []
  })
}

const allowed = (rel, cls) => ALLOWLIST.some((e) => e.file === rel && e.class === cls)

function main() {
  const args = argv.slice(2)
  const report = args.includes('--report')
  const staged = args.includes('--staged')
  const pathArgs = args.filter((a) => !a.startsWith('--'))
  if (staged && pathArgs.length === 0) {
    console.log('✓ design-token guard: no staged files')
    exit(0)
  }
  const files = collect(pathArgs, staged)
  const wholeTree = pathArgs.length === 0 && !staged

  let matchers
  try {
    matchers = buildMatchers(loadVocabulary())
  } catch (e) {
    if (!(e instanceof FailClosed)) throw e
    console.error(`design-token guard: cannot run (${e.message}). Failing closed.`)
    exit(2)
  }

  const offenders = []
  const seen = new Set()
  for (const { path, rel } of files) {
    let source
    try {
      source = staged ? readIndexBlob(rel) : readFileSync(path, 'utf8')
    } catch (e) {
      console.error(`design-token guard: cannot read ${path} (${e.message}). Failing closed.`)
      exit(2)
    }
    for (const h of analyze(source, rel, matchers)) {
      seen.add(`${rel}\0${h.cls}`)
      if (!allowed(rel, h.cls)) offenders.push({ rel, ...h })
    }
  }

  if (report) {
    const counts = Object.fromEntries(FAMILIES.map((f) => [f, 0]))
    for (const o of offenders) counts[o.rule]++
    for (const f of FAMILIES) console.log(`${f} ${counts[f]}`)
    console.log(`outside allowlist: ${offenders.length}; allowlist entries: ${ALLOWLIST.length}`)
    exit(0)
  }

  const stale = wholeTree ? ALLOWLIST.filter((e) => !seen.has(`${e.file}\0${e.class}`)) : []
  if (offenders.length > 0 || stale.length > 0) {
    console.error('✖ design-token guard:')
    for (const o of offenders)
      console.error(`  ${o.rel}:${o.line}  ${o.rule}  ${o.cls}  — ${o.why}`)
    for (const e of stale)
      console.error(`  stale allowlist entry: ${e.file}  ${e.class}  (${e.owner})`)
    console.error(
      '\nUse a token from apps/web/app/tokens.css. See .claude/hooks/check-design-tokens.mjs for the rules and the allowlist.',
    )
    exit(1)
  }
  console.log(`✓ design-token guard: ${files.length} file(s) clean`)
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  main()
}
