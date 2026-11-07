// Shared GitHub-workflow `run:` step parser. Imported by .claude/controls.test.mjs and
// .claude/hooks/run-ci-lint.mjs; not a guard and not a suite (no ci.yml step of its own).
// Handles single-line and block-scalar (`|`, `>-`, ...) bodies. Anything else is the caller's.

export const RUN_LINE_RE = /^(\s*)(?:-\s*)?run:[ \t]?(.*)$/
export const BLOCK_SCALAR_RE = /^[>|][-+0-9]*\s*(#.*)?$/

/** Call `onStep(bodyLines)` for every `run:` step in a workflow file's text. */
export function forEachRunStep(text, onStep) {
  const lines = text.replace(/\r/g, '').split('\n')
  let i = 0
  while (i < lines.length) {
    const raw = lines[i]
    if (/^\s*#/.test(raw)) {
      i++
      continue
    }
    const m = RUN_LINE_RE.exec(raw)
    if (!m) {
      i++
      continue
    }
    const [block, next] = readRunBody(lines, i, m[1].length, m[2])
    onStep(block)
    i = next
  }
}

/** Read a `run:` step's body — the rest of its own line, or a block-scalar's indented lines. */
export function readRunBody(lines, i, baseIndent, rest) {
  if (!BLOCK_SCALAR_RE.test(rest.trim())) return [[rest], i + 1]
  const collected = []
  let j = i + 1
  while (j < lines.length) {
    const l = lines[j]
    if (l.trim() !== '' && l.length - l.trimStart().length <= baseIndent) break
    collected.push(l)
    j++
  }
  return [collected, j]
}

const indentOf = (l) => l.length - l.trimStart().length

/** Lines under `jobs.<jobId>` (comment lines, any column, never end the job) and the `jobs:` line index. */
function jobBody(lines, jobId) {
  const jobsAt = lines.findIndex((l) => /^jobs:\s*$/.test(l))
  if (jobsAt === -1) throw new Error('no top-level `jobs:`')
  const start = lines.findIndex(
    (l, k) => k > jobsAt && l.trim() === `${jobId}:` && indentOf(l) === 2,
  )
  if (start === -1) throw new Error(`no job \`${jobId}\``)
  let end = start + 1
  while (
    end < lines.length &&
    (lines[end].trim() === '' || /^\s*#/.test(lines[end]) || indentOf(lines[end]) > 2)
  )
    end++
  return { jobsAt, job: lines.slice(start + 1, end) }
}

/**
 * Steps of `jobs.<jobId>` as `{ name, env, run, uses, unsupported }`: `uses` = a `uses:` key at the step's key indent, `env` = the
 * step's `env:` block text ('' when absent), `run` = the command string (literal `|` keeps
 * newlines, folded `>` joins with spaces) or null for a step without `run:`, `unsupported` = step keys the caller cannot honor.
 */
export function jobSteps(text, jobId) {
  const { job } = jobBody(text.replace(/\r/g, '').split('\n'), jobId)
  const stepsAt = job.findIndex((l) => /^\s*steps:\s*$/.test(l))
  if (stepsAt === -1) throw new Error(`job \`${jobId}\` has no \`steps:\``)
  const body = job.slice(stepsAt + 1)
  const itemIndent = indentOf(body.find((l) => /^\s*-\s/.test(l)) ?? '')
  const items = []
  for (const l of body) {
    if (indentOf(l) === itemIndent && /^\s*-\s/.test(l)) items.push([l])
    else if (items.length) items.at(-1).push(l)
  }
  return items.map((item) => parseItem(item, itemIndent + 2))
}

const UNSUPPORTED_STEP_KEYS = new Set(['working-directory', 'shell', 'continue-on-error'])

function parseItem(lines, keyIndent) {
  const step = {
    name: null,
    env: '',
    run: null,
    uses: false,
    unsupported: [],
  }
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const l = i === 0 ? raw.replace('-', ' ') : raw
    if (indentOf(l) !== keyIndent || /^\s*#/.test(l)) continue
    const rm = RUN_LINE_RE.exec(raw)
    if (rm) {
      step.run = runText(lines, i, keyIndent, rm[2])
      if (foldedIrregular(lines, i, keyIndent, rm[2]))
        step.unsupported.push('folded run with a blank or more-indented line')
      if (quotedEscape(rm[2])) step.unsupported.push('quoted run with a YAML escape')
      if (continuesDeeper(lines, i, keyIndent, rm[2]))
        step.unsupported.push('multi-line plain or quoted run')
      continue
    }
    const m = /^\s*([\w-]+):[ \t]?(.*)$/.exec(l)
    if (!m) continue
    if (m[1] === 'name') step.name = scalarText(m[2])
    else if (m[1] === 'uses') step.uses = true
    else if (UNSUPPORTED_STEP_KEYS.has(m[1])) step.unsupported.push(m[1])
    else if (m[1] === 'env') {
      let j = i + 1
      while (
        j < lines.length &&
        (lines[j].trim() === '' || /^\s*#/.test(lines[j]) || indentOf(lines[j]) > keyIndent)
      )
        j++
      step.env = [m[2], ...lines.slice(i + 1, j)].join('\n')
    }
  }
  return step
}

/** A non-block-scalar `run:` (empty value included) followed by a deeper content line: YAML folds it into the scalar. */
function continuesDeeper(lines, i, keyIndent, rest) {
  if (BLOCK_SCALAR_RE.test(rest.trim())) return false
  for (const l of lines.slice(i + 1)) {
    if (l.trim() === '' || /^\s*#/.test(l)) continue
    return indentOf(l) > keyIndent
  }
  return false
}

/** One-line quoted run whose text holds its quote's YAML escape (`\\` in "...", `''` in '...'). */
function quotedEscape(rest) {
  const q = /^(["'])(.*?)\1(\s+#.*)?$/.exec(rest.trim())
  if (!q) return false
  return q[1] === '"' ? q[2].includes('\\') : q[2].includes("''")
}

/** A folded (`>`) body whose blank or more-indented line YAML would not join with a space. */
function foldedIrregular(lines, i, keyIndent, rest) {
  if (!rest.trim().startsWith('>') || !BLOCK_SCALAR_RE.test(rest.trim())) return false
  const [body] = readRunBody(lines, i, keyIndent, rest)
  const content = body.join('\n').replace(/\s+$/, '').split('\n')
  const cut = Math.min(...content.filter((x) => x.trim() !== '').map(indentOf))
  return content.some((x) => x.trim() === '' || indentOf(x) > cut)
}

/** One-line scalar: a quoted value (lazy match, optional trailing comment), else with ` #…` stripped. */
function scalarText(raw) {
  const v = raw.trim()
  const q = /^(["'])(.*?)\1(\s+#.*)?$/.exec(v)
  return /^["']/.test(v) && q ? q[2] : v.replace(/\s+#.*$/, '')
}

function runText(lines, i, keyIndent, rest) {
  const [body] = readRunBody(lines, i, keyIndent, rest)
  if (!BLOCK_SCALAR_RE.test(rest.trim())) {
    return scalarText(rest)
  }
  const content = body.filter((x) => x.trim() !== '')
  const cut = Math.min(...content.map(indentOf))
  const dedented = body
    .map((x) => x.slice(cut))
    .join('\n')
    .replace(/\s+$/, '')
  return rest.trim().startsWith('>') ? content.map((x) => x.trim()).join(' ') : dedented
}

/** Lines of the block under each `key:` at exactly `indent`, as `{ key, rest, body }`. */
function keyBlocks(lines, indent) {
  const out = []
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*([\w-]+):[ \t]?(.*)$/.exec(lines[i])
    if (!m || indentOf(lines[i]) !== indent || /^\s*#/.test(lines[i])) continue
    let j = i + 1
    while (
      j < lines.length &&
      (lines[j].trim() === '' || /^\s*#/.test(lines[j]) || indentOf(lines[j]) > indent)
    )
      j++
    out.push({ key: m[1], rest: m[2], body: lines.slice(i + 1, j) })
  }
  return out
}

/**
 * Workflow- and job-level scope of `jobs.<jobId>`: `env` = `[{ where, text }]` for every `env:`
 * block, `unsupported` =
 * `defaults:` / `working-directory` / `shell` / `continue-on-error` keys found at either level, and
 * `container:` / `services:` / `strategy:` keys found at job level.
 */
export function jobScope(text, jobId) {
  const lines = text.replace(/\r/g, '').split('\n')
  const { jobsAt, job } = jobBody(lines, jobId)
  const jobIndent = indentOf(job.find((l) => l.trim() !== '' && !/^\s*#/.test(l)) ?? '')
  const scope = { env: [], unsupported: [] }
  for (const [where, blocks] of [
    ['workflow', keyBlocks(lines.slice(0, jobsAt), 0)],
    ['job', keyBlocks(job, jobIndent)],
  ]) {
    for (const b of blocks) {
      if (b.key === 'env') scope.env.push({ where, text: [b.rest, ...b.body].join('\n') })
      else if (
        [
          'defaults',
          'working-directory',
          'shell',
          'continue-on-error',
          'container',
          'services',
          'strategy',
        ].includes(b.key)
      )
        scope.unsupported.push(`${where} ${b.key}`)
    }
  }
  return scope
}

/**
 * Parse an `env:` block text into `{ vars, problems }`. Only scalar `KEY: value` lines export;
 * a non-scalar shape, a `${{ }}` value or a quoted value containing `\` or `''` is a problem.
 */
export function parseEnv(blockText) {
  const vars = {}
  const problems = []
  const [first, ...rest] = blockText.split('\n')
  if (first.replace(/\s+#.*$/, '').trim() !== '')
    problems.push(`env is not a block mapping: ${first.trim()}`)
  for (const l of rest) {
    if (l.trim() === '' || /^\s*#/.test(l)) continue
    const m = /^\s*([A-Za-z_]\w*):[ \t]+(\S.*)$/.exec(l)
    if (!m || /^[|>{[&*!]/.test(m[2])) {
      problems.push(`env entry is not a scalar KEY: value: ${l.trim()}`)
      continue
    }
    const q = /^(["'])(.*)\1\s*(#.*)?$/.exec(m[2])
    const value = q ? q[2] : m[2].replace(/\s+#.*$/, '')
    if (q && /\\|''/.test(q[2])) {
      problems.push(`env ${m[1]} is a quoted value with a YAML escape: ${m[2].trim()}`)
      continue
    }
    const expr = /\$\{\{.*?\}\}/.exec(value)
    if (expr) problems.push(`env ${m[1]} contains ${expr[0]}`)
    else vars[m[1]] = value
  }
  return { vars, problems }
}
