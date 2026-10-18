import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EMAIL_OTP_EXPIRY_SECONDS, formatOtpLifetime } from './email-otp-config'

describe('EMAIL_OTP_EXPIRY_SECONDS', () => {
  it('matches the otp_expiry in supabase/config.toml', () => {
    const toml = readFileSync(join(process.cwd(), '../../supabase/config.toml'), 'utf8')
    const match = /^otp_expiry\s*=\s*(\d+)/m.exec(toml)
    expect(match).not.toBeNull()
    expect(EMAIL_OTP_EXPIRY_SECONDS).toBe(Number(match?.[1]))
  })
})

describe('formatOtpLifetime', () => {
  it('words a one-hour lifetime as "1 hour"', () => {
    expect(formatOtpLifetime()).toBe('1 hour')
  })
})
