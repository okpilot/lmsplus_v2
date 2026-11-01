#!/usr/bin/env node
// Mechanical guard (#1433 / #1677 PR B): every Tailwind class in apps/web source is a design token.
// Scans string and template literals for class tokens and reports rules R1..R12:
//   R1  numeric spacing/sizing step outside the step allowlist (p m gap space inset top right
//       bottom left translate w h size min- max- basis)
//   R2  `inline` / `row` role name on a spacing utility
//   R3  `z-<n>`
//   R4  border / ring / ring-offset / outline / outline-offset / divide-x|y width >= 1, `ring-inset`
//   R5  `opacity-<n>` other than 0, 100, disabled
//   R6  `/NN` colour opacity modifier
//   R7  arbitrary `[...]` values and `min-[...]` / `max-[...]` variants
//   R8  stock names of cleared namespaces (colour hues, font-weight, tracking, breakpoints md/xl/2xl,
//       shadow / inset-shadow / drop-shadow / text-shadow), derived from Tailwind's theme stylesheet minus
//       apps/web/app/tokens.css. Fails closed (exit 2) when either file is missing.
//   R9  named radius, bare rounded, named max-w, arbitrary size/value, `!` important,
//       Tailwind default text sizes, arbitrary text sizes
//   R10 native `title=` on a lowercase DOM element
//   R11 numeric `strokeWidth` outside diagrams/** and score-ring.tsx
//   R12 hex colour in lib/email/**
//
// R8 hues are re-derived here exactly as `stockColourHues` in apps/web/lib/design/build-tokens-css.ts
// does (every `--color-<hue>-50` in Tailwind's resolved theme stylesheet): that module is TypeScript with
// extensionless imports and cannot be imported by plain node.
//
// Usage:
//   node .claude/hooks/check-design-tokens.mjs <file...>   staged mode: scan the given files in scope
//   node .claude/hooks/check-design-tokens.mjs             whole tree; also fails on a stale allowlist entry
//   node .claude/hooks/check-design-tokens.mjs --report    per-family counts outside the allowlist, exit 0
// Exit: 0 clean, 1 violations, 2 cannot run (fail closed).

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
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

export function loadVocabulary() {
  let themePath
  try {
    themePath = createRequire(join(REPO, 'apps/web/package.json')).resolve('tailwindcss/theme.css')
  } catch {
    throw new FailClosed('tailwindcss/theme.css could not be resolved from apps/web')
  }
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
  }
}

// ------------------------------------------------------------------ rules

const STEPS = new Set(['0', '0.5', '1', '1.5', '2', '2.5', '3', '4', '5', '6', '8', '10'])
const SPACING_PREFIX =
  '(?:p[xytrblse]?|m[xytrblse]?|gap(?:-[xy])?|space-[xy]|inset(?:-[xy])?|top|right|bottom|left|start|end|translate-[xy]|w|h|size|min-[wh]|max-[wh]|basis)'
const R1_RE = new RegExp(`^(${SPACING_PREFIX})-(\\d+(?:\\.\\d+)?)$`)
const R2_RE = /^(?:p[xytrblse]?|m[xytrblse]?|gap(?:-[xy])?|space-[xy])-(?:inline|row)$/
const R4_RE =
  /^(?:border(?:-[xytblrse])?|ring|ring-offset|outline|outline-offset|divide-[xy])-(\d+)$/
const OPACITY_OK = new Set(['0', '100', 'disabled'])
const COLOUR_PREFIX =
  /^(?:bg|text|border(?:-[xytblrse])?|ring|ring-offset|outline|fill|stroke|from|via|to|shadow|inset-shadow|drop-shadow|text-shadow|divide|decoration|accent|caret|placeholder)-/
const MODIFIER_RE = /^([a-z][\w-]*)\/(?:\d+(?:\.\d+)?|\[[^\]]*\])$/

// R9: ported from the retired layout-guard and type-size-guard tests. Their arbitrary-value rule is R7.
const R9_RULES = [
  /(?<![\w-])(?:[a-z-]+:)*rounded(?:-[trblse]{1,2})?-(?:xs|sm|md|lg|xl|2xl|3xl|4xl|full)(?![\w-])/,
  /(?<![\w-])(?:[a-z-]+:)*rounded(?![\w-])/,
  /(?<![\w-])(?:[a-z-]+:)*rounded(?:-[trblse]{1,2})?-\[/,
  /(?<![\w-])(?:[a-z-]+:)*max-w-(?:xs|sm|md|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|prose)(?![\w-])/,
  /(?<![\w-])(?:[a-z-]+:)*size-\[/,
  /(?<!\w)[a-z][\w-]*-[\w./()%-]+!(?=[\s"'`]|$)/,
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
    const isText = mod[1].startsWith('text-')
    if (!/^\d+(?:\.\d+)?$/.test(rest) && !(isText && m.textRoles.has(rest))) {
      flag('R6', 'colour opacity modifier')
    }
  }

  if (/^[a-z][\w-]*-\[/.test(base)) flag('R7', 'arbitrary value')
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
    const before = text.slice(0, open.index).trimEnd()
    const prev = before.at(-1) ?? ''
    if (/[\w)\]]/.test(prev) && !/\breturn$/.test(before)) continue
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
      else if (depth === 0) attrs += c
    }
    if (/\stitle\s*=/.test(attrs)) sites.push(open.index)
  }
  return sites
}

/** @returns {{ line: number, rule: string, cls: string, why: string }[]} (allowlist NOT applied) */
export function analyze(source, rel, m) {
  const text = source.replace(/\r/g, '')
  const hits = []
  const add = (index, rule, cls, why) => hits.push({ line: lineAt(text, index), rule, cls, why })

  for (const lit of text.matchAll(QUOTED)) {
    const body = lit[2] ?? lit[3] ?? ''
    const bodyStart = lit.index + lit[0].indexOf(body)
    for (const tok of body.matchAll(/\S+/g)) {
      const cls = tok[0].replace(TRIM, '')
      if (cls === '') continue
      for (const { rule, why } of classifyToken(cls, m)) add(bodyStart + tok.index, rule, cls, why)
    }
    if (rel.startsWith('apps/web/lib/email/')) {
      for (const hex of body.matchAll(
        /(?<![\w&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g,
      )) {
        add(bodyStart + hex.index, 'R12', hex[0], 'hex colour in email code')
      }
    }
  }

  for (const index of nativeTitleSites(text)) add(index, 'R10', 'title=', 'native title tooltip')

  if (!/\/diagrams\/|score-ring\.tsx$/.test(rel)) {
    const re = /\bstrokeWidth\s*(?:=\s*(?:\{\s*-?\d[\d.]*\s*\}|"-?\d[\d.]*")|:\s*-?\d)/g
    for (const s of text.matchAll(re))
      add(s.index, 'R11', s[0].replace(/\s+/g, ''), 'numeric strokeWidth')
  }
  return hits
}

/** Repo-relative `apps/web/...` path when `path` is a scanned source file, else null. */
export function scopedRel(path) {
  const p = path.replace(/\\/g, '/')
  if (/(?:^|\/)(?:node_modules|\.next)\//.test(p) || p.includes('.claude/worktrees/')) return null
  const hit = /(?:^|\/)(apps\/web\/(?:app|components|lib)\/.+)$/.exec(p)
  if (!hit) return null
  const rel = hit[1]
  if (!/\.(?:ts|tsx)$/.test(rel)) return null
  if (/\.(?:test|spec)\.(?:ts|tsx)$/.test(rel)) return null
  if (/\/e2e\/|\/scripts\//.test(rel) || rel.startsWith('apps/web/lib/design/')) return null
  return rel
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

function collect(args) {
  const paths = []
  if (args.length > 0) paths.push(...args.filter((p) => existsSync(p)))
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
  const files = collect(args.filter((a) => a !== '--report'))
  const wholeTree = args.filter((a) => a !== '--report').length === 0

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
    for (const h of analyze(readFileSync(path, 'utf8'), rel, matchers)) {
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
