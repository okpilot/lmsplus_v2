#!/usr/bin/env node

// Mechanical guard: block a FILE PATH written in PROSE, inside the binding corpus, that does
// not RESOLVE on disk. `.claude/rules/code-style.md` §9 says that when a core file is renamed
// you must "always grep all docs for stale references before committing", and §10 makes a
// comment asserting something the code does not do a defect in its own right. A path is the
// most mechanically checkable claim prose makes — the file is there or it is not — and until
// this guard nothing ever ran that grep. §9 was an instruction with no artifact.
//
// Usage:  node .claude/hooks/check-prose-paths.mjs                 (pre-commit; staged)
//         node .claude/hooks/check-prose-paths.mjs --all           (CI; whole worktree)
//         node .claude/hooks/check-prose-paths.mjs --update-baseline
// Exit:   0 = no unbaselined dead path, no stale baseline row
//         1 = a finding — a new dead path, a stale row, or an unusable waiver
//         2 = the check COULD NOT RUN (usage, git failure, unreadable baseline)
//
// Why 1 and 2 are separate. This guard ships an inline suppression marker. If "could not run"
// and "this path does not exist" shared exit 1, the cheapest way past a BROKEN INVOCATION —
// a git failure, an unreadable baseline — would be to write a permanent `prose-path-ok`
// waiver, which would then sit in the corpus forever excusing a finding that was never made
// while the guard reported green having read nothing. Exit 2 makes the waiver structurally
// unavailable as a remedy for a check that did not run, and the message at the bottom of this
// file says so out loud. Do not collapse them.
//
// THE SIX NARROWINGS, all measured. Each is structural — applied before any exclusion class —
// and each was added because dropping it floods the run. The hit counts below are CALIBRATION
// figures: they are what the detector measured over four iterations on the corpus as it stood
// when it was built, and they are the argument for each narrowing existing. They are NOT a
// current inventory, and nothing re-derives them. For the live funnel run
// `node .claude/hooks/measure-prose-paths.mjs`, which is committed for exactly this reason.
//   1. A LEADING `/` IS REJECTED. An absolute token is not a repo path: Next.js routes
//      (`/app/quiz`, 25 hits), URL paths, and shebang targets (`/usr/bin/env`, 18 hits).
//   2. A LEADING `@` IS REJECTED BY LOOKBEHIND. npm specifiers (`@repo/ui/question-card`)
//      therefore die by CONSTRUCTION rather than by an exclusion rule — an exclusion rule can
//      be reached only after a token has already been counted, and a class that is never
//      counted cannot be mis-tallied later.
//   3. TWO NON-EMPTY SEGMENTS MINIMUM. A token must assert a LOCATION, not a NAME. Without
//      this the run is dominated by `Next.js` (47 hits) and `process.env`, where the `.js` and
//      `.env` extensions match an ordinary English word, and by the bare basenames
//      (`plan.md`, `quiz.ts`) the corpus deliberately writes by name everywhere.
//   4. A PATH SHAPE IS REQUIRED: a known extension, a trailing `/`, a glob tail, or a first
//      segment that is a real top-level repo entry. Without it English alternation dominates
//      everything else — `status/summary`, `try/catch`, `INSERT/UPDATE/DELETE`,
//      `correct/incorrect`, `origin/master...HEAD` — 1,602 fake hits, the single biggest class
//      by an order of magnitude.
//   5. RESOLUTION INDEXES DIRECTORY SUFFIXES, NOT ONLY FILE SUFFIXES. Prose refers to files
//      relative to a directory under discussion (`redteam/attack-surface.md`, `lib/queries/`,
//      `e2e/redteam/`). Indexing files only called every one of those a miss: it took the
//      residual from 69 to 108, and all 39 were context-relative references that were right.
//   6. LONGEST-FIRST EXTENSION ALTERNATION plus a trailing `(?![\w-])`. Both are required, and
//      neither is sufficient alone: without them `.tsx` truncates to `.ts` and `.json` to
//      `.js`, and the truncated token then fails to resolve and is reported as a dead path.
//      Two earlier attempts at this detector shipped exactly that bug.
// THE FUNNEL IS NOT STATED HERE. `node .claude/hooks/measure-prose-paths.mjs` prints it —
// raw candidates, non-resolving, residual after the exclusion classes, and the binding
// surface — and it is committed for exactly that reason. Four numbers written here would
// have gone stale inside the very commit that added them: this guard ships alongside a
// baseline, a decision entry and its own two suites, every one of which adds corpus prose.
// That is `code-style.md` §10 cl.7, and the sibling guard states no figure for the same
// reason (Decision 68).
//
// KNOWN BOUNDS, stated because understating them would be this guard's own defect:
//   - it catches a path that does not RESOLVE. It says NOTHING about a path that resolves
//     while the claim wrapped around it is false — "`admin.ts` holds the service key" is
//     graded solely on `admin.ts` existing;
//   - it cannot see a paraphrase ("the admin client module", "the hooks directory");
//   - it cannot tell SELF-NEGATING prose from a stale citation. "the file `x.ts` was deleted"
//     and "see `x.ts`" are the same token to it, and the first is a correct sentence;
//   - it cannot tell HISTORICAL narrative from a current claim. A rule recounting what a
//     2026-07 commit did names paths that were real then and are not now;
//   - a path inside a THIRD-PARTY package's distribution is indistinguishable from a repo path
//     that went missing. Example, in the TypeScript npm package:
//     `lib/typescript.js` // prose-path-ok: this bound IS a path that does not resolve HERE; it resolves inside a dependency this guard cannot see
//   - a token that resolves only because an UNTRACKED file of that name happens to sit in the
//     worktree passes. Resolution is "on disk", and that is deliberately the weaker test.
// It reduces the class; it does not close it.

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { argv, exit } from 'node:process'
import { pathToFileURL } from 'node:url'
import { EMPTY_REASONS, inCorpus, proseLines } from './check-prose-claims.mjs'

const MAX_BUFFER = 64 * 1024 * 1024

const BASELINE_PATH = '.claude/prose-paths.json'
const GUARD = '.claude/hooks/check-prose-paths.mjs'

const KNOWN_FLAGS = new Set(['--all', '--update-baseline'])

/**
 * A spec's design/tasks/requirements docs name files BEFORE they are built. Naming an unbuilt
 * file is what a task list IS, so a spec is the one place in the corpus where an unresolvable
 * path is the intended content rather than a defect. The large majority of residual hits over
 * the wide corpus are these, and every one inspected was correct prose. No ratio is stated: the
 * denominator moves whenever the corpus gains a file, and it moved inside the very commit that
 * introduced this guard (§10 cl.7). Re-derive both terms with
 * `node .claude/hooks/measure-prose-paths.mjs --residual`.
 *
 * `.spec-workflow/steering/**` is KEPT: `agent-workflow.md § Rule-Mirror Sync` marks steering
 * ALWAYS live — never superseded the way a completed spec is — so a path in `structure.md` or
 * `tech.md` is a claim about the repo as it stands today.
 *
 * Excluding the whole spec tree also subsumes the sibling's completed-spec exclusion, so this
 * guard needs no `completedSpecDirs` pass at all.
 */
const SPEC_PREFIX = '.spec-workflow/specs/'

/** Gitignored trees that hold notes, not artifacts: a citation into one must resolve to a TRACKED file. */
const UNTRACKED_NOTE_PREFIXES = [SPEC_PREFIX, '.work/']
const inNoteTree = (t) => UNTRACKED_NOTE_PREFIXES.some((p) => t.startsWith(p))

/**
 * `.json` has no comment syntax, so it has no prose lines — the same reason
 * `check-prose-claims.mjs` gives for why `limits.json` can never flag itself. A path inside a
 * JSON file is DATA: this guard's own baseline is a list of quoted path strings, and grading
 * it would be grading data as prose. Dropped at the corpus level rather than yielding zero
 * lines, so the exclusion is visible in the file list instead of hidden in the scanner.
 */
export const DATA_EXT = new Set(['.json'])

// ---------------------------------------------------------------- token recognition

/**
 * Extensions that make a token a file reference. The head of this list is the same one
 * `check-retracted-phrase.mjs` declares, extended with the forms that appear as paths in this
 * corpus. ORDER IS LOAD-BEARING and so is the lookahead — see narrowing 6.
 */
const EXT = [
  'tsx',
  'jsx',
  'mjs',
  'cjs',
  'yaml',
  'json',
  'sql',
  'yml',
  'ts',
  'js',
  'md',
  'sh',
  'py',
  'css',
  'txt',
  'toml',
  'lock',
  'env',
]

/** One path segment's characters. Globs and `<placeholder>` forms are admitted deliberately:
 *  they must be RECOGNISED so they can be classified and excluded by name, rather than falling
 *  out of the regex silently and leaving the exclusion untestable. */
const SEG = '[A-Za-z0-9_*.<>{}#-]'
const SEGS = `(?:${SEG}+\\/)+`

/**
 * A path-like token. Two alternatives: anything carrying a slash, or a bare basename with a
 * known extension.
 *
 * The lookbehind rejects a preceding word char, `.`, `@`, `/` or `-`. `@` is narrowing 2. `/`
 * is what stops an absolute or URL path from being re-entered at its second segment after
 * narrowing 1 has rejected the whole token. `.` kills `v1.2` and the interior of a hostname.
 */
export const PATH_RE = new RegExp(
  `(?<![\\w.@/-])((?:\\.{0,2}\\/?${SEGS}(?:${SEG}+|\\*\\*|))|(?:[A-Za-z0-9_*<][A-Za-z0-9_.*<>{}#-]*\\.(?:${EXT.join('|')})))(?![\\w-])`,
  'g',
)

/** Sentence punctuation that the regex swallows because it is also legal in a filename. */
const TRAIL = /[.,;:)\]'"`>]+$/

const EXT_TAIL = new RegExp(`\\.(?:${EXT.join('|')})$`)

/**
 * Does this token assert a LOCATION on disk? Narrowings 1, 3 and 4, in that order.
 *
 * `toplevel` is the set of real top-level repo entries. Requiring membership is what keeps a
 * genuinely wrong directory reference (`apps/web/nope`) findable while rejecting
 * `origin/master`, whose first segment names nothing in this repo.
 */
export function looksLikePath(tok, toplevel) {
  if (tok.startsWith('/')) return false
  const t = tok.replace(/^\.\//, '')
  const segs = t.split('/').filter((x) => x.length > 0)
  if (segs.length < 2) return false
  if (EXT_TAIL.test(t.replace(/\/+$/, ''))) return true
  if (tok.endsWith('/')) return true
  if (tok.endsWith('*')) return true
  return toplevel.has(segs[0])
}

// ---------------------------------------------------------------- resolution index

/**
 * Everything needed to answer "does this token resolve?", built once per run.
 *
 * `suffixes` carries every tail of every tracked FILE path AND of every tracked DIRECTORY path
 * — narrowing 5. Without the directory half, an ordinary context-relative reference reads as a
 * dead path, which is the failure mode that makes a guard get waived rather than obeyed.
 */
export function buildIndex(tracked) {
  const trackedSet = new Set(tracked)
  const dirSet = new Set()
  for (const f of tracked) {
    const parts = f.split('/')
    for (let i = 1; i < parts.length; i += 1) dirSet.add(parts.slice(0, i).join('/'))
  }
  const basenames = new Set(tracked.map((f) => f.split('/').pop()))
  const suffixes = new Set()
  for (const f of tracked) {
    const parts = f.split('/')
    for (let i = 0; i < parts.length; i += 1) suffixes.add(parts.slice(i).join('/'))
  }
  for (const d of dirSet) {
    const parts = d.split('/')
    for (let i = 0; i < parts.length; i += 1) suffixes.add(parts.slice(i).join('/'))
  }
  const toplevel = new Set(tracked.map((f) => f.split('/')[0]))
  return { trackedSet, dirSet, basenames, suffixes, toplevel }
}

/** Token, normalised for every lookup: no `./` head, no trailing slashes.
 *  Exported because `measure-prose-paths.mjs` keys its ignored set with it: a second copy there
 *  would diverge on the first regex edit and silently move tokens between the classes it counts. */
export const normalise = (tok) => tok.replace(/^\.\//, '').replace(/\/+$/, '')

/**
 * Does the token name something that exists? Index first, filesystem second.
 *
 * `existsSync` is the deliberately weaker second test: an untracked file that is nevertheless
 * THERE makes the prose true, and a guard that called it a dead path would be asserting
 * something false about the disk to enforce a rule about accuracy.
 */
export function resolves(tok, index) {
  const t = normalise(tok)
  // A token that normalises to nothing was punctuation, not a path. Treat it as resolved so it
  // never reaches the report; there is no claim here to grade.
  if (!t) return true
  if (index.trackedSet.has(t) || index.dirSet.has(t)) return true
  return existsSync(t)
}

// ---------------------------------------------------------------- classification

const PLACEHOLDER = /<[^>]*>|\{[^}]*\}|\bpath\/to\b|YYYYMMDD|NNN|\bfoo\b|\bbar\b/i
const GLOB = /[*?]|\[[^\]]+\]/
const NPM = /^@[a-z0-9-]+\//i
const URL_RE = /https?:\/\/[^\s)`'"]*/g

/**
 * Why a non-resolving token is NOT a finding. Everything that falls through is.
 *
 * `isIgnored` is injected rather than called directly so the whole `git check-ignore` round
 * trip can be batched once per run (see `collectCandidates`) instead of forked per token.
 */
export function classify(tok, line, index, isIgnored) {
  const t = normalise(tok)
  // `{a,b}` brace expansion written in prose. The regex captures only the head, so the token
  // is a fragment of a shell word rather than a path anyone claimed exists.
  if (tok.includes('{') || tok.includes('}')) return 'brace-expansion'
  // `../x` — relative to the FILE'S OWN directory, not to the repo root. Resolving it would
  // need the reader's position, which prose does not carry.
  if (tok.startsWith('../') || tok.startsWith('.../')) return 'context-relative'
  // Only a token that is actually INSIDE a URL on this line. Testing the line for `http` alone
  // would exempt every path on any line that also happens to cite a doc link.
  if ((line.match(URL_RE) ?? []).some((u) => u.includes(tok))) return 'URL'
  // `@repo/ui/question-card` — a module specifier. Narrowing 2 kills these at the regex, so
  // this branch is the belt to that suspenders: a specifier reached by some other route (a
  // line-initial position, a future regex edit) is still named rather than reported.
  if (NPM.test(t)) return 'npm-package-specifier'
  // An UNPAIRED `<` or `>` counts too. TRAIL strips a trailing `>` before classification, so
  // a token ending in `<name>` arrives here as `<name` and PLACEHOLDER's `<[^>]*>` no longer
  // matches it. Without this the guard reports a stand-in name as a dead path.
  if (PLACEHOLDER.test(t) || t.includes('<') || t.includes('>')) return 'placeholder'
  // A glob asserts a PATTERN, not a file. `.claude/hooks/*.mjs` is true whether or not any
  // particular member exists, and matching it against the tree would grade the wrong claim.
  if (GLOB.test(t)) return 'glob'
  // `packages/db/migrations/**` is FROZEN (2026-07-11) and carries false history. Prose cites
  // it precisely to warn readers off it — `agent-coderabbit.md` does exactly this — so
  // the citation is correct even though nothing there is current.
  if (t.startsWith('packages/db/migrations')) return 'frozen-historical'
  if (t.startsWith('node_modules/') || t.includes('/node_modules/')) return 'node_modules'
  // Runtime and generated artifacts. Derived from `git check-ignore`, never a hand-written
  // list: a hand list goes stale against `.gitignore` silently and in the fail-open direction.
  if (isIgnored(t) && !inNoteTree(t)) return 'gitignored-artifact'
  // `user/session/question/membership` — English alternation that survived narrowing 4 because
  // its first segment happens to name a top-level entry. NARROW on purpose: all-plain-word
  // segments AND no trailing slash. A first cut omitted the trailing-slash condition and
  // swallowed 15 legitimate directory references (`lib/queries/`, `auth/callback/`) to catch
  // one true positive. Over-exclusion is the worse failure — it hides findings, and nothing
  // downstream can tell that it happened.
  if (!tok.endsWith('/') && t.split('/').every((seg) => /^[A-Za-z]+$/.test(seg))) {
    return 'english-alternation'
  }
  // `tech.md/decisions.md/plan.md` — a slash-joined ENGLISH list of filenames. Every segment
  // carries its own extension, which no real path does.
  if (t.includes('/') && t.split('/').every((seg) => EXT_TAIL.test(seg))) return 'slash-joined-list'
  // `supabase/migrations/20260410000009` — a migration cited by its TIMESTAMP PREFIX, which is
  // how every rule file refers to one. The full filename carries a description this omits.
  if (/^supabase\/migrations\/\d{8,14}$/.test(t)) return 'migration-prefix-ref'
  // Narrowing 5: a tail of a real path is a reference relative to a directory under discussion.
  if (index.suffixes.has(t)) return 'context-relative'
  if (!t.includes('/') && index.basenames.has(t)) return 'context-relative'
  // A slashless token that reached here is a basename naming nothing. Narrowing 3 should have
  // stopped it; kept as a named class so that if one ever arrives it is visible rather than
  // reported as a repo path it never claimed to be.
  if (!t.includes('/')) return 'bare-basename-unresolved'
  return 'unresolved'
}

/** The only class that is a finding. Everything else is named above with its reason. */
const FINDING_CLASS = 'unresolved'

// ---------------------------------------------------------------- prose extraction

export const extOf = (path) => {
  const dot = path.lastIndexOf('.')
  const slash = path.lastIndexOf('/')
  return dot > slash ? path.slice(dot) : ''
}

/**
 * Prose lines of one corpus file. Delegates to `check-prose-claims.mjs` rather than
 * reimplementing markdown and comment scanning: that scanner carries five holes closed by
 * cloud review — a block comment whose body has no leading star, a block opener that must
 * BEGIN the line, a fence closer that must be bare, duplicate-line keying, the indented-block
 * carve-out. Reimplementing re-introduces all five.
 *
 * ONE deviation: `.yaml`/`.yml` is graded WHOLE-FILE. The sibling grades yaml comments only,
 * correctly for its own question — a cap VALUE sitting in a yaml string is data. A PATH in a
 * yaml string is not: `.coderabbit.yaml`'s `path_instructions` are hand-written prose
 * addressed to a reviewer and they name files by path. Comment-only grading misses every one
 * of them, and a meaningful share of the binding surface lives in that file. No ratio is
 * stated: the terms are different units that drift independently (tokens vs distinct prose
 * lines) and an earlier draft of this very sentence mixed them. Re-derive with
 * `node .claude/hooks/measure-prose-paths.mjs`.
 */
export function prosePathLines(path, content) {
  const ext = extOf(path)
  if (ext === '.yaml' || ext === '.yml') {
    return content.split('\n').map((text, i) => ({ n: i + 1, text }))
  }
  return proseLines(path, content)
}

// ---------------------------------------------------------------- waivers

const WAIVER_RE = /(?:<!--|\/\/|#)\s*prose-path-ok:\s*(.*?)\s*(?:-->)?\s*$/

/**
 * The inline escape hatch, on the flagged line itself. Returns `null` when absent,
 * `{ reason }` when usable, `{ problem }` when the reason asserts nothing.
 *
 * Parsed ONLY AFTER a finding is made on the line — a waiver on a clean line is inert text, and
 * validating it would turn a stale marker into a fresh blocking error for no gain.
 *
 * A waiver must COST something. It is greppable, it is visible in the diff that introduces it,
 * and it carries a written reason — no flag, no env var, no allowlist file, because each of
 * those moves the cost away from the line whose claim is being excused.
 */
export function parseWaiver(text) {
  const m = WAIVER_RE.exec(text)
  if (!m) return null
  const reason = m[1]
  const bare = reason
    .toLowerCase()
    .replace(/[^a-z ]/g, '')
    .trim()
  if (reason.replace(/\s/g, '').length < 20 || EMPTY_REASONS.has(bare)) {
    return {
      problem: `the reason must state WHY this path cannot resolve (>= 20 chars, not a bare "${reason}")`,
    }
  }
  return { reason }
}

// ---------------------------------------------------------------- baseline keys

/**
 * A finding's baseline key: path plus a content hash of the TRIMMED line.
 *
 * NOT path + line number. Prose line numbers drift on every edit made above them, so a
 * line-keyed baseline would go stale on edits that never touched the citation — and the remedy
 * for that noise would be to stop reading the baseline. The unit under baseline for prose is
 * the LINE TEXT. Rewriting a baselined line therefore yields a stale row (reported) AND, if the
 * path is still dead, a new violation (caught), which is the intended pair.
 */
export function pathKey(path, text, occurrence = 0) {
  const digest = createHash('sha256').update(text.trim(), 'utf8').digest('hex').slice(0, 16)
  // The occurrence suffix keeps a SECOND identical line from inheriting the first one's row.
  // Keyed on path+text alone, copy two collapses onto copy one and passes. Occurrence 0 keeps
  // its bare key so the overwhelming majority of rows are not invalidated by this at once.
  return occurrence === 0 ? `${path}@${digest}` : `${path}@${digest}#${occurrence}`
}

/** A short, reviewable excerpt stored as the baseline row's VALUE. */
const excerpt = (text) => {
  const t = text.trim()
  return t.length > 120 ? `${t.slice(0, 117)}...` : t
}

// ---------------------------------------------------------------- git

function git(args, opts) {
  return execFileSync('git', args, { maxBuffer: MAX_BUFFER, ...opts })
}

function splitNul(buf) {
  return buf
    .toString('utf8')
    .split('\0')
    .filter((s) => s.length > 0)
}

/** Tracked paths, used BOTH as the resolution index and as the corpus candidate list. */
export function trackedPaths() {
  return splitNul(git(['ls-files', '-z', '--full-name']))
}

/**
 * The set of tokens `.gitignore` claims, resolved in ONE `git check-ignore` call.
 *
 * Batched rather than forked per token because `classify` would otherwise spawn a process for
 * every non-resolving token on every commit — 459 of them at the time of measurement.
 *
 * EXIT CODES: 0 = some path matched, 1 = none matched (NOT an error — `check-ignore` reports
 * "nothing is ignored" that way), anything else is a real failure and must propagate. Treating
 * every non-zero exit as "nothing ignored" would silently turn a broken git into a run that
 * reports every generated artifact as a dead path.
 */
export function ignoredTokens(tokens) {
  // `git check-ignore` exits 128 with `fatal: ... is outside repository` on a path that climbs
  // out of the tree, and ONE such token aborts the whole batch — the per-token form the probe
  // used hid this behind its own try/catch. `..` tokens never reach `isIgnored` anyway: they
  // are classified `context-relative` several branches earlier. Dropping them here keeps the
  // batch submittable without changing a single verdict.
  const list = [...tokens].filter((t) => !t.split('/').includes('..'))
  if (list.length === 0) return new Set()
  // Ask about BOTH spellings of every token. A DIRECTORY-ONLY pattern (`/.next/`,
  // `**/.claude/worktrees/`) matches a slash-less path only while the directory EXISTS on disk,
  // because that is the only way git can tell the path is a directory. `normalise` strips the
  // trailing slash, so querying its output alone makes the verdict depend on untracked build
  // output: green on a machine that has run `pnpm build`, RED in a clean checkout. The
  // trailing-slash form matches either way. Map every hit back to the bare token so `isIgnored`
  // stays keyed on what `normalise` produces.
  const input = Buffer.from(`${list.flatMap((t) => [t, `${t}/`]).join('\0')}\0`, 'utf8')
  try {
    const hits = splitNul(git(['check-ignore', '-z', '--stdin'], { input }))
    return new Set(hits.map((h) => h.replace(/\/+$/, '')))
  } catch (err) {
    if (err.status === 1) return new Set()
    throw err
  }
}

/**
 * Staged paths, SELF-ENUMERATED.
 *
 * Deliberately NOT lefthook's `{staged_files}`: lefthook filters that list through the
 * command's own `glob:`, so a corpus extension the glob forgets becomes a silent pass — the
 * guard runs, reports clean, and never saw the file.
 *
 * `--name-status -M`, and BOTH paths of an `R` entry are taken: `--name-only` prints only a
 * rename's DESTINATION, so a citation moved OUT of a graded path would drop out of scope.
 */
export function stagedPaths(raw) {
  const fields = splitNul(raw)
  const out = []
  for (let i = 0; i < fields.length; ) {
    const status = fields[i]
    if (!/^[A-Z]\d*$/.test(status)) {
      // A desync shifts every later path by one and the guard then scopes the WRONG files at
      // exit 0. Abort rather than resynchronise on a guess.
      throw new Error(`unrecognised --name-status record ${JSON.stringify(status)}`)
    }
    const count = status[0] === 'R' || status[0] === 'C' ? 2 : 1
    for (let k = 1; k <= count; k += 1) out.push(fields[i + k])
    i += 1 + count
  }
  return out
}

/**
 * Read a path's INDEX content by its exact BYTES — the same `cat-file --batch` stdin trick
 * `check-prose-claims.mjs` and `check-file-size-guard.mjs` use, and for the same reason: argv
 * is strings, so a path holding a byte that does not decode would be re-encoded to something
 * that names nothing, and the guard would call a perfectly readable staged file unreadable.
 *
 * `cat-file --batch` exits 0 for a missing object, printing `<spec> missing` instead of a blob
 * header — so the header is CHECKED. Skipping that makes this helper fail OPEN.
 */
function readIndexBlob(path) {
  const out = git(['cat-file', '--batch'], {
    input: Buffer.concat([Buffer.from(':'), Buffer.from(path, 'utf8'), Buffer.from([0x0a])]),
  })
  const nl = out.indexOf(0x0a)
  const header = nl === -1 ? out.toString('utf8') : out.subarray(0, nl).toString('utf8')
  const blob = header.match(/ blob (\d+)$/)
  if (!blob) throw new Error(`git cat-file could not resolve the staged path: ${header}`)
  return out.subarray(nl + 1, nl + 1 + Number(blob[1])).toString('utf8')
}

// ---------------------------------------------------------------- corpus

/**
 * The prose corpus for PATHS: the sibling's corpus, minus the spec tree and minus data files.
 * Reusing `inCorpus` rather than re-declaring the roots keeps ONE definition of what "binding
 * prose" means; two copies would drift the first time a root is added to either.
 */
export function inPathCorpus(path) {
  if (!inCorpus(path)) return false
  if (path.startsWith(SPEC_PREFIX)) return false
  if (DATA_EXT.has(extOf(path))) return false
  return true
}

export function corpusFiles(tracked) {
  return tracked.filter(inPathCorpus)
}

// ---------------------------------------------------------------- evaluation

/**
 * Pass one: every path-like token in every corpus file, split into "resolved" (counted only)
 * and "non-resolving" (carried forward for classification).
 *
 * Kept separate from classification so the `git check-ignore` round trip can be batched over
 * the whole run, and so `measure-prose-paths.mjs` can re-derive the same funnel without
 * duplicating the scanner.
 *
 * @returns {{raw: number, candidates: Array<object>, problems: Array<object>}}
 */
export function collectCandidates(files, readFile, index) {
  let raw = 0
  const candidates = []
  const problems = []

  for (const path of files) {
    let content
    try {
      content = readFile(path)
    } catch (err) {
      // Every path here came from `git ls-files`, so git asserts it exists. A read failure means
      // the tree changed underneath the run, or a permission bit did — either way the answer is
      // untrustworthy. FAIL CLOSED rather than skipping the file silently.
      problems.push({ path, n: null, problem: `unreadable (${err.code ?? err.message})` })
      continue
    }
    for (const { n, text } of prosePathLines(path, content)) {
      for (const m of text.matchAll(PATH_RE)) {
        const tok = m[1].replace(TRAIL, '')
        // A token stripped to punctuation, or to a lone separator, asserts nothing.
        if (!tok || !/[A-Za-z0-9]/.test(tok)) continue
        if (!looksLikePath(tok, index.toplevel)) continue
        raw += 1
        if (resolves(tok, index)) continue
        candidates.push({ path, n, text, tok })
      }
    }
  }
  return { raw, candidates, problems }
}

/**
 * Evaluate every corpus file.
 *
 * @returns {{findings: Map<string, object>, problems: Array<object>, raw: number,
 *            byClass: Map<string, number>}}
 *   `findings` is keyed by `pathKey`, ONE ENTRY PER LINE carrying every dead token on it — a
 *   line is the unit under baseline, so two dead paths in one sentence are one row and are
 *   fixed together.
 */
export function evaluate(files, readFile, index) {
  const { raw, candidates, problems } = collectCandidates(files, readFile, index)

  const ignored = ignoredTokens(new Set(candidates.map((c) => normalise(c.tok))))
  const isIgnored = (t) => ignored.has(t)

  const byClass = new Map()
  const perLine = new Map()
  for (const c of candidates) {
    const cls = classify(c.tok, c.text, index, isIgnored)
    byClass.set(cls, (byClass.get(cls) ?? 0) + 1)
    if (cls !== FINDING_CLASS) continue
    // Grouping key is path + LINE NUMBER, not the line text: two physically distinct lines with
    // identical text must stay distinct here, and the occurrence suffix below is what
    // distinguishes them once they reach the baseline.
    const lineKey = `${c.path}\u0000${c.n}`
    const entry = perLine.get(lineKey)
    if (entry) entry.tokens.push(c.tok)
    else perLine.set(lineKey, { path: c.path, n: c.n, text: c.text, tokens: [c.tok] })
  }

  const findings = new Map()
  const seen = new Map()
  for (const entry of perLine.values()) {
    const waiver = parseWaiver(entry.text)
    if (waiver?.problem) {
      problems.push({ path: entry.path, n: entry.n, problem: waiver.problem })
      continue
    }
    if (waiver) continue
    const dupKey = `${entry.path}\u0000${entry.text.trim()}`
    const occurrence = seen.get(dupKey) ?? 0
    seen.set(dupKey, occurrence + 1)
    findings.set(pathKey(entry.path, entry.text, occurrence), entry)
  }

  return { findings, problems, raw, byClass }
}

/**
 * Baseline rows that describe no live finding — the line was edited, the path came back, the
 * file moved out of the corpus, or it was waived. Reported, never auto-applied: a check that
 * rewrites its own baseline can launder any finding into a clean run.
 */
export function staleBaselineEntries(findings, baseline) {
  return Object.keys(baseline ?? {}).filter((key) => !findings.has(key))
}

// ---------------------------------------------------------------- baseline IO

function readBaseline() {
  let text
  try {
    text = readFileSync(BASELINE_PATH, 'utf8')
  } catch (err) {
    // ENOENT is the only recoverable case, and it fails CLOSED by construction: with no
    // baseline every live finding is a new violation, so the run BLOCKS loudly rather than
    // passing. Any other error (a permission bit, a directory in its place) is exit 2.
    if (err.code === 'ENOENT') return {}
    throw err
  }
  const obj = JSON.parse(text)
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new Error(`${BASELINE_PATH}: top level must be an object`)
  }
  const claims = obj.claims ?? {}
  if (claims === null || typeof claims !== 'object' || Array.isArray(claims)) {
    throw new Error(`${BASELINE_PATH}: \`claims\` must be an object`)
  }
  return claims
}

/**
 * `--update-baseline`: rewrite the data file from the live finding set. HUMAN-INVOKED only.
 * The enforcement path never writes it — a guard that can rewrite its own baseline reports
 * clean by construction. Every added row is printed with a `+`, because a row added here
 * grandfathers a citation that names nothing and needs an argument in the PR.
 */
function updateBaseline(findings, previous) {
  const next = {}
  for (const key of [...findings.keys()].sort()) next[key] = excerpt(findings.get(key).text)

  const added = Object.keys(next).filter((k) => previous[k] === undefined)
  const removed = Object.keys(previous).filter((k) => next[k] === undefined)

  if (added.length === 0 && removed.length === 0) {
    console.error('[prose-paths] baseline already matches the corpus — nothing written.')
    return 0
  }
  for (const k of removed) console.error(`  - ${k}  (was: ${previous[k]})`)
  for (const k of added) console.error(`  + ${k}  ${next[k]}`)

  const body = {
    _: `Prose citations of a path that does not resolve, grandfathered. SHRINK-ONLY: enforced by ${GUARD}, whose ENFORCEMENT path never writes this file — only the human-invoked --update-baseline does, via updateBaseline(). Keys are <path>@<sha256-16 of the trimmed prose line>, so a row goes stale the moment its line is edited. Regenerate with \`node ${GUARD} --update-baseline\` and REVIEW THE DIFF — a \`+\` line accepts prose naming a file that is not there.`,
    claims: next,
  }
  writeFileSync(BASELINE_PATH, `${JSON.stringify(body, null, 2)}\n`)
  console.error(`\n[prose-paths] ${BASELINE_PATH} rewritten. REVIEW THE DIFF before committing —`)
  console.error('  a `+` line grandfathers a dead path citation, which needs an argument.')
  return 0
}

// ---------------------------------------------------------------- main

/**
 * Print the findings and return the exit code. Pure output: it decides nothing.
 *
 * The three blocks stay in ONE function because their ORDER is the message — what is unusable,
 * then what is new, then what no longer matches — and splitting them further would hide that
 * ordering behind call sites.
 */
function reportFindings({ scopedProblems, fresh, stale, baseline }) {
  if (scopedProblems.length > 0) {
    console.error('✖ prose-paths guard: unusable `prose-path-ok` waiver or unreadable file\n')
    for (const p of scopedProblems) {
      console.error(`  ${p.path}${p.n === null ? '' : `:${p.n}`}  ${p.problem}`)
    }
    console.error('')
  }

  if (fresh.length > 0) {
    console.error('✖ prose-paths guard (code-style.md §9, §10): prose cites a path that does not')
    console.error('  resolve on disk.\n')
    for (const [, f] of fresh) {
      console.error(`  ${f.path}:${f.n}  ${f.tokens.join(', ')}`)
      console.error(`    ${excerpt(f.text)}`)
    }
    console.error('\n  → the file moved or went away. Correct the citation, or describe the thing')
    console.error('    without naming a path that is not there.')
    console.error('  → or, if this prose genuinely must name a path that cannot resolve, mark it:')
    console.error('      <!-- prose-path-ok: <why this path cannot resolve> -->')
    console.error('      // prose-path-ok: <why this path cannot resolve>\n')
  }

  if (stale.length > 0) {
    console.error(`✖ prose-paths guard: ${BASELINE_PATH} rows describe no live finding.\n`)
    for (const key of stale) console.error(`  ${key}  (was: ${baseline[key]})`)
    console.error('\n  → the prose line changed or the path came back. Record it:')
    console.error(`      node ${GUARD} --update-baseline\n`)
  }

  // Scope context explains a CORPUS SCAN result. A stale-row-only failure is baseline
  // maintenance — the scan found nothing — so printing what was searched there answers a
  // question the reader did not ask.
  if (fresh.length > 0 || scopedProblems.length > 0) {
    console.error(
      'Searched: CLAUDE.md, .coderabbit.yaml, .claude/**, docs/**, .spec-workflow/steering/**',
    )
    console.error(`Excluded: ${SPEC_PREFIX}**, *.json, code/data lines, globs,`)
    console.error('  placeholders, URLs, npm specifiers, gitignored artifacts, frozen migrations')
  }
  return 1
}

export function main(args) {
  const flags = args.filter((a) => a.startsWith('--'))
  const positional = args.filter((a) => !a.startsWith('--'))
  if (positional.length > 0) {
    // This guard SELF-ENUMERATES. Accepting paths would reintroduce exactly the hole the
    // self-enumeration closes — a caller passing a filtered list that omits a corpus file.
    console.error(`✖ prose-paths guard: takes flags only, got ${JSON.stringify(positional[0])}`)
    return 2
  }
  const unknown = flags.filter((f) => !KNOWN_FLAGS.has(f))
  if (unknown.length > 0) {
    console.error(`✖ prose-paths guard: unknown flag(s) ${unknown.join(' ')}`)
    return 2
  }
  // Two modes both clear the unknown-flag gate, then whichever branch is tested first wins and
  // the other request is dropped with no diagnostic at exit 0 — the collision
  // `check-file-size-guard.mjs` documents at its own arg parser. Do not guess a precedence.
  if (new Set(flags).size > 1) {
    console.error(`✖ prose-paths guard: ${[...new Set(flags)].join(' and ')} are separate modes`)
    return 2
  }

  const staged = !flags.includes('--all') && !flags.includes('--update-baseline')
  const read = (path) => (staged ? readIndexBlob(path) : readFileSync(path, 'utf8'))

  const tracked = trackedPaths()
  const index = buildIndex(tracked)
  const { findings, problems } = evaluate(corpusFiles(tracked), read, index)

  if (flags.includes('--update-baseline')) {
    if (problems.length > 0) {
      // Writing a baseline from a partial read would record the corpus as smaller than it is,
      // and every citation in the unread file would then be invisible forever.
      console.error(
        '✖ prose-paths guard: cannot rewrite the baseline — an unreadable file or an unusable waiver',
      )
      for (const p of problems) console.error(`  ${p.path}: ${p.problem}`)
      return 2
    }
    return updateBaseline(findings, readBaseline())
  }

  const baseline = readBaseline()
  const stale = staleBaselineEntries(findings, baseline)

  // BLOCKING SCOPE. A commit is not failed by a dead path in a file it did not touch —
  // otherwise the guard's introduction blocks every commit in the repo until the whole corpus
  // is clean. Stale rows are NOT scoped: they are a property of the data file, and the whole
  // point of a shrink-only ratchet is that a shrink must be RECORDED.
  const scope = staged
    ? new Set(stagedPaths(git(['diff', '--cached', '--name-status', '-z', '-M'])))
    : null
  const inScope = (path) => scope === null || scope.has(path)

  const fresh = [...findings.entries()].filter(
    ([key, f]) => baseline[key] === undefined && inScope(f.path),
  )
  const scopedProblems = problems.filter((p) => inScope(p.path))

  if (fresh.length === 0 && stale.length === 0 && scopedProblems.length === 0) return 0

  return reportFindings({ scopedProblems, fresh, stale, baseline })
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  try {
    exit(main(argv.slice(2)))
  } catch (err) {
    console.error(`✖ prose-paths guard: check could not run — BLOCKING: ${err.message}`)
    console.error(
      '  This is an environmental failure, NOT a finding. Do NOT write a prose-path-ok waiver for it.',
    )
    exit(2)
  }
}
