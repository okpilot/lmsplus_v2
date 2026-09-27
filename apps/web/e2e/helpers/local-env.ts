import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export type LocalEnvInput = {
  files: Record<string, string>
  env: Record<string, string | undefined>
}

const SUPABASE_URL_KEY_RE = /^[A-Z_]*SUPABASE_URL$/
const LOCAL_URL_RE = /^http:\/\/(localhost|127\.0\.0\.1)[:/]/
const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

const ENV_FILES = [
  '.env',
  '.env.local',
  '.env.development',
  '.env.development.local',
  '.env.production',
  '.env.production.local',
]

type ParsedLine = { key: string; value: string }

/** Parses one dotenv line: optional `export`, optional quotes, `#` comments. */
function parseLine(line: string): ParsedLine | null {
  const trimmed = line.trim()
  if (trimmed === '' || trimmed.startsWith('#')) return null
  const withoutExport = trimmed.replace(/^export\s+/, '')
  const eq = withoutExport.indexOf('=')
  if (eq === -1) return null
  const key = withoutExport.slice(0, eq).trim()
  if (!KEY_RE.test(key)) return null
  return { key, value: parseValue(withoutExport.slice(eq + 1).trim()) }
}

/** Strips a matching pair of quotes, or an unquoted trailing `#` comment. */
function parseValue(raw: string): string {
  const isQuoted =
    raw.length >= 2 &&
    ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'")))
  if (isQuoted) return raw.slice(1, -1)
  const hashIndex = raw.indexOf('#')
  return (hashIndex === -1 ? raw : raw.slice(0, hashIndex)).trim()
}

/** Violation messages (no source, no value) for one key/value pair. */
function violationsForEntry(key: string, value: string): string[] {
  const messages: string[] = []
  if (key === 'RESEND_API_KEY' && value !== '') messages.push('RESEND_API_KEY set')
  if (SUPABASE_URL_KEY_RE.test(key) && value !== '' && !LOCAL_URL_RE.test(value)) {
    messages.push(`${key} is not a local Supabase URL`)
  }
  return messages
}

function violationsInFile(content: string, source: string): string[] {
  const violations: string[] = []
  for (const rawLine of content.split(/\r\n|\n/)) {
    const parsed = parseLine(rawLine)
    if (!parsed) continue
    for (const msg of violationsForEntry(parsed.key, parsed.value)) {
      violations.push(`${msg} in ${source}`)
    }
  }
  return violations
}

function violationsInEnv(env: Record<string, string | undefined>): string[] {
  const violations: string[] = []
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue
    for (const msg of violationsForEntry(key, value)) {
      violations.push(`${msg} in process.env`)
    }
  }
  return violations
}

/** Never includes the offending VALUE — only the key name and its source. */
export function localEnvViolations({ files, env }: LocalEnvInput): string[] {
  const violations: string[] = []
  for (const [source, content] of Object.entries(files)) {
    violations.push(...violationsInFile(content, source))
  }
  violations.push(...violationsInEnv(env))
  return violations
}

/** Throws if `webDir`'s env files or `process.env` carry a live-send or non-local-Supabase value. */
export function assertLocalEnv(webDir: string): void {
  const files: Record<string, string> = {}
  for (const name of ENV_FILES) {
    const filePath = join(webDir, name)
    if (existsSync(filePath)) files[name] = readFileSync(filePath, 'utf8')
  }
  const violations = localEnvViolations({ files, env: process.env })
  if (violations.length > 0) {
    throw new Error(`assertLocalEnv: ${violations.join('; ')}`)
  }
}
