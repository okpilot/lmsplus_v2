// Shared GitHub-workflow `run:` step parser. Imported by .claude/controls.test.mjs and
// .claude/hooks/run-ci-lint.mjs; not a guard and not a suite (no ci.yml step of its own).
// Handles single-line and block-scalar (`|`, `>-`, ...) bodies. Anything else is the caller's.

export const RUN_LINE_RE = /^(\s*)(?:-\s*)?run:[ \t]?(.*)$/
export const BLOCK_SCALAR_RE = /^[>|][-+0-9]*\s*(#.*)?$/

/** Call `onStep(bodyLines)` for every `run:` step in a workflow file's text. */
export function forEachRunStep(text, onStep) {
  const lines = text.split('\n')
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
const unquote = (s) => s.trim().replace(/^(["'])(.*)\1$/, '$2')

/**
 * Steps of `jobs.<jobId>` as `{ name, ifCond, env, run }`: `env` = the step's `env:` block text
 * ('' when absent), `run` = the command string (literal `|` keeps newlines, folded `>` joins
 * with spaces) or null for a step without `run:`.
 */
export function jobSteps(text, jobId) {
  const lines = text.split('\n')
  const jobsAt = lines.findIndex((l) => /^jobs:\s*$/.test(l))
  if (jobsAt === -1) throw new Error('no top-level `jobs:`')
  const start = lines.findIndex(
    (l, k) => k > jobsAt && l.trim() === `${jobId}:` && indentOf(l) === 2,
  )
  if (start === -1) throw new Error(`no job \`${jobId}\``)
  let end = start + 1
  while (end < lines.length && (lines[end].trim() === '' || indentOf(lines[end]) > 2)) end++
  const job = lines.slice(start + 1, end)
  const stepsAt = job.findIndex((l) => /^\s*steps:\s*$/.test(l))
  if (stepsAt === -1) throw new Error(`job \`${jobId}\` has no \`steps:\``)
  const body = job.slice(stepsAt + 1)
  const itemIndent = indentOf(body.find((l) => /^\s*-\s/.test(l)) ?? '')
  const items = []
  for (const l of body) {
    if (indentOf(l) === itemIndent && /^\s*-\s/.test(l)) items.push([l.replace('-', ' ')])
    else if (items.length) items.at(-1).push(l)
  }
  return items.map((item) => parseItem(item, itemIndent + 2))
}

function parseItem(lines, keyIndent) {
  const step = { name: null, ifCond: null, env: '', run: null }
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (indentOf(l) !== keyIndent || /^\s*#/.test(l)) continue
    const m = /^\s*([\w-]+):[ \t]?(.*)$/.exec(l)
    if (!m) continue
    if (m[1] === 'name') step.name = unquote(m[2])
    else if (m[1] === 'if') step.ifCond = m[2].trim()
    else if (m[1] === 'env') {
      let j = i + 1
      while (j < lines.length && (lines[j].trim() === '' || indentOf(lines[j]) > keyIndent)) j++
      step.env = [m[2], ...lines.slice(i + 1, j)].join('\n')
    } else if (m[1] === 'run') {
      const [body] = readRunBody(lines, i, keyIndent, m[2])
      const block = BLOCK_SCALAR_RE.test(m[2].trim())
      if (!block) step.run = unquote(m[2])
      else {
        const content = body.filter((x) => x.trim() !== '')
        const cut = Math.min(...content.map(indentOf))
        const dedented = body
          .map((x) => x.slice(cut))
          .join('\n')
          .replace(/\s+$/, '')
        step.run = m[2].trim().startsWith('>') ? content.map((x) => x.trim()).join(' ') : dedented
      }
    }
  }
  return step
}
