import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { SITTING_RPC_ERRORS, sittingFailure } from './sitting-action-result'

const COPY: Record<string, string> = {
  not_authenticated: 'Not authorized',
  not_admin: 'Not authorized',
  admin_not_found: 'Not authorized',
  invalid_input: 'Invalid input',
  sitting_not_found: 'Sitting not found',
  sitting_closed: 'This sitting is closed and cannot be changed.',
  sitting_day_ended: "This sitting's day has ended.",
  sitting_not_editable: 'Time, mode and materials cannot be changed once the sitting is open.',
  sitting_not_scheduled: 'This sitting has already been started.',
  sitting_not_due:
    'Too early: a sitting can start from its UTC day. Edit the date to run it earlier.',
  sitting_not_open: 'This sitting is not open.',
  sitting_has_attempts: 'A candidate has already taken an exam in this sitting.',
  scheduled_in_past: 'The sitting date must be today or later (UTC).',
  invigilator_not_found:
    'The invigilator must be an active admin or instructor of your organization',
}

describe('SITTING_RPC_ERRORS', () => {
  it.each(Object.entries(COPY))('maps token %s to its spec copy', (token, copy) => {
    expect(SITTING_RPC_ERRORS[token]).toBe(copy)
  })

  it('has a copy line for every token the sitting migrations raise', () => {
    const out = execFileSync(
      'git',
      [
        'grep',
        '-ohE',
        "RAISE EXCEPTION '[a-z_]+'",
        '--',
        'supabase/migrations/20261116001[23456]*.sql',
        'supabase/migrations/20261116002[01]*.sql',
        'supabase/migrations/20261116000400_private_sitting_guard_helpers.sql',
      ],
      { cwd: `${__dirname}/../../../../../../../..`, encoding: 'utf8' },
    )
    const tokens = [...new Set([...out.matchAll(/'([a-z_]+)'/g)].map((m) => m[1] as string))]
    expect(tokens.length).toBeGreaterThan(10)
    for (const t of tokens) expect(SITTING_RPC_ERRORS, t).toHaveProperty(t)
  })
})

describe('sittingFailure', () => {
  it('returns the mapped copy for an exact token', () => {
    expect(sittingFailure('sitting_not_open', 'Failed to close sitting')).toEqual({
      success: false,
      error: 'This sitting is not open.',
    })
  })

  it('returns the per-action fallback for an unmapped message', () => {
    expect(sittingFailure('boom', 'Failed to start sitting')).toEqual({
      success: false,
      error: 'Failed to start sitting',
    })
  })

  it('does not match a message that merely contains a token', () => {
    expect(sittingFailure('error: sitting_closed (extra)', 'Failed to update sitting')).toEqual({
      success: false,
      error: 'Failed to update sitting',
    })
  })
})
