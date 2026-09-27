import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { assertLocalEnv, localEnvViolations } from './local-env'

describe('localEnvViolations — RESEND_API_KEY', () => {
  it('flags a non-empty value in a file', () => {
    const v = localEnvViolations({ files: { '.env.local': 'RESEND_API_KEY=re_abc123' }, env: {} })
    expect(v).toEqual(['RESEND_API_KEY set in .env.local'])
  })

  it('flags a non-empty value in process.env', () => {
    const v = localEnvViolations({ files: {}, env: { RESEND_API_KEY: 're_abc123' } })
    expect(v).toEqual(['RESEND_API_KEY set in process.env'])
  })

  it('passes an empty value', () => {
    const v = localEnvViolations({ files: { '.env': 'RESEND_API_KEY=' }, env: {} })
    expect(v).toEqual([])
  })

  it('reads an exported, double-quoted value', () => {
    const v = localEnvViolations({
      files: { '.env': 'export RESEND_API_KEY="re_abc123"' },
      env: {},
    })
    expect(v).toEqual(['RESEND_API_KEY set in .env'])
  })

  it('reads a single-quoted value', () => {
    const v = localEnvViolations({ files: { '.env': "RESEND_API_KEY='re_abc123'" }, env: {} })
    expect(v).toEqual(['RESEND_API_KEY set in .env'])
  })

  it('strips everything after the closing quote, including a trailing comment', () => {
    const v = localEnvViolations({
      files: { '.env': 'RESEND_API_KEY="re_abc123" # prod key' },
      env: {},
    })
    expect(v).toEqual(['RESEND_API_KEY set in .env'])
  })

  it('reads an empty quoted value followed by a trailing comment', () => {
    const v = localEnvViolations({ files: { '.env': 'RESEND_API_KEY="" # off' }, env: {} })
    expect(v).toEqual([])
  })

  it('ignores a commented-out line', () => {
    const v = localEnvViolations({ files: { '.env': '# RESEND_API_KEY=re_abc123' }, env: {} })
    expect(v).toEqual([])
  })

  it('reads a value followed by an unquoted trailing comment', () => {
    const v = localEnvViolations({
      files: { '.env': 'RESEND_API_KEY=re_abc123 # prod key' },
      env: {},
    })
    expect(v).toEqual(['RESEND_API_KEY set in .env'])
  })

  it('handles CRLF line endings', () => {
    const v = localEnvViolations({
      files: { '.env': 'RESEND_API_KEY=re_abc123\r\nOTHER=1\r\n' },
      env: {},
    })
    expect(v).toEqual(['RESEND_API_KEY set in .env'])
  })

  it('never includes the value in the violation message', () => {
    const v = localEnvViolations({
      files: { '.env': 'RESEND_API_KEY=re_super_secret_value' },
      env: {},
    })
    expect(v.join(' ')).not.toContain('re_super_secret_value')
  })
})

describe('localEnvViolations — *SUPABASE_URL', () => {
  it('passes a localhost URL', () => {
    const v = localEnvViolations({
      files: { '.env': 'NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321' },
      env: {},
    })
    expect(v).toEqual([])
  })

  it('passes a 127.0.0.1 URL', () => {
    const v = localEnvViolations({
      files: { '.env': 'SUPABASE_URL=http://127.0.0.1:54321' },
      env: {},
    })
    expect(v).toEqual([])
  })

  it('passes a 127.0.0.1 URL with a trailing slash', () => {
    const v = localEnvViolations({
      files: { '.env': 'SUPABASE_URL=http://127.0.0.1:54321/' },
      env: {},
    })
    expect(v).toEqual([])
  })

  it('passes a quoted localhost URL with a trailing comment', () => {
    const v = localEnvViolations({
      files: { '.env': 'NEXT_PUBLIC_SUPABASE_URL="http://localhost:54321" # local' },
      env: {},
    })
    expect(v).toEqual([])
  })

  it('flags a hosted host smuggled in as localhost userinfo', () => {
    const v = localEnvViolations({
      files: {
        '.env': 'NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321@x.supabase.co',
      },
      env: {},
    })
    expect(v).toEqual(['NEXT_PUBLIC_SUPABASE_URL is not a local Supabase URL in .env'])
  })

  it('flags an unparseable URL value', () => {
    const v = localEnvViolations({
      files: { '.env': 'NEXT_PUBLIC_SUPABASE_URL=not a url' },
      env: {},
    })
    expect(v).toEqual(['NEXT_PUBLIC_SUPABASE_URL is not a local Supabase URL in .env'])
  })

  it('flags a hosted URL, naming the key but not the value', () => {
    const v = localEnvViolations({
      files: { '.env': 'NEXT_PUBLIC_SUPABASE_URL=https://x.supabase.co' },
      env: {},
    })
    expect(v).toEqual(['NEXT_PUBLIC_SUPABASE_URL is not a local Supabase URL in .env'])
  })

  it('flags a hosted URL supplied via process.env', () => {
    const v = localEnvViolations({ files: {}, env: { SUPABASE_URL: 'https://x.supabase.co' } })
    expect(v).toEqual(['SUPABASE_URL is not a local Supabase URL in process.env'])
  })

  it('passes an empty value', () => {
    const v = localEnvViolations({ files: { '.env': 'NEXT_PUBLIC_SUPABASE_URL=' }, env: {} })
    expect(v).toEqual([])
  })

  it('ignores a key that does not end in SUPABASE_URL', () => {
    const v = localEnvViolations({
      files: { '.env': 'SUPABASE_URL_HINT=https://x.supabase.co' },
      env: {},
    })
    expect(v).toEqual([])
  })
})

describe('localEnvViolations — file handling', () => {
  it('skips a file that is not present', () => {
    const v = localEnvViolations({ files: {}, env: {} })
    expect(v).toEqual([])
  })
})

describe('assertLocalEnv', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'local-env-test-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('does not throw when no env files exist', () => {
    expect(() => assertLocalEnv(dir)).not.toThrow()
  })

  it('throws naming the key when a hosted SUPABASE_URL is set', () => {
    writeFileSync(join(dir, '.env.local'), 'NEXT_PUBLIC_SUPABASE_URL=https://x.supabase.co\n')
    expect(() => assertLocalEnv(dir)).toThrow(/NEXT_PUBLIC_SUPABASE_URL/)
  })

  it('throws naming RESEND_API_KEY when it is set', () => {
    writeFileSync(join(dir, '.env'), 'RESEND_API_KEY=re_abc123\n')
    expect(() => assertLocalEnv(dir)).toThrow(/RESEND_API_KEY/)
  })
})
