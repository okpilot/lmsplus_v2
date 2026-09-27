import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'dotenv'

export type LocalEnvInput = {
  files: Record<string, string>
  env: Record<string, string | undefined>
}

const SUPABASE_URL_KEY_RE = /^[A-Z_]*SUPABASE_URL$/

const ENV_FILES = [
  '.env',
  '.env.local',
  '.env.development',
  '.env.development.local',
  '.env.production',
  '.env.production.local',
]

/** True only for an `http:` URL whose hostname is localhost or 127.0.0.1. */
function isLocalUrl(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  return url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
}

/** Violation messages (no source, no value) for one key/value pair. */
function violationsForEntry(key: string, value: string): string[] {
  const messages: string[] = []
  if (key === 'RESEND_API_KEY' && value !== '') messages.push('RESEND_API_KEY set')
  if (SUPABASE_URL_KEY_RE.test(key) && value !== '' && !isLocalUrl(value)) {
    messages.push(`${key} is not a local Supabase URL`)
  }
  return messages
}

function violationsInFile(content: string, source: string): string[] {
  const violations: string[] = []
  for (const [key, value] of Object.entries(parse(content))) {
    for (const msg of violationsForEntry(key, value)) {
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

/** Throws if `webDir`'s env files or `env` carry a live-send or non-local-Supabase value. */
export function assertLocalEnv(
  webDir: string,
  env: Record<string, string | undefined> = process.env,
): void {
  const files: Record<string, string> = {}
  for (const name of ENV_FILES) {
    const filePath = join(webDir, name)
    if (existsSync(filePath)) files[name] = readFileSync(filePath, 'utf8')
  }
  const violations = localEnvViolations({ files, env })
  if (violations.length > 0) {
    throw new Error(`assertLocalEnv: ${violations.join('; ')}`)
  }
}
