import { describe, expect, it } from 'vitest'
import {
  computeLoginInstructionsState,
  loginInstructionsConfirmText,
  loginInstructionsStateLabel,
} from './login-instructions-state'

describe('computeLoginInstructionsState', () => {
  it('reports not_sent when login instructions were never sent', () => {
    expect(computeLoginInstructionsState({ sentAt: null, pendingAt: null })).toBe('not_sent')
  })

  it('reports waiting while the own-password marker is set after a send', () => {
    expect(
      computeLoginInstructionsState({
        sentAt: '2026-06-14T00:00:00.000Z',
        pendingAt: '2026-06-21T00:00:00.000Z',
      }),
    ).toBe('waiting')
  })

  it('reports waiting for a marker on an account that predates the send flow', () => {
    expect(
      computeLoginInstructionsState({ sentAt: null, pendingAt: '2026-06-21T00:00:00.000Z' }),
    ).toBe('waiting')
  })

  it('reports waiting even when the marker date is in the past', () => {
    expect(
      computeLoginInstructionsState({
        sentAt: '2026-01-01T00:00:00.000Z',
        pendingAt: '2026-01-08T00:00:00.000Z',
      }),
    ).toBe('waiting')
  })

  it('reports password_set when sent and the marker has been cleared', () => {
    expect(
      computeLoginInstructionsState({ sentAt: '2026-06-01T00:00:00.000Z', pendingAt: null }),
    ).toBe('password_set')
  })
})

describe('loginInstructionsStateLabel', () => {
  it.each([
    ['not_sent', 'Not sent yet'],
    ['waiting', 'Waiting for the student to set a password'],
    ['password_set', 'Password set'],
  ] as const)('labels %s as "%s"', (state, label) => {
    expect(loginInstructionsStateLabel(state)).toBe(label)
  })
})

describe('loginInstructionsConfirmText', () => {
  it('says a first send emails a link that works once for one hour', () => {
    expect(loginInstructionsConfirmText('not_sent', 'Bob Example')).toBe(
      'Email Bob Example a link to set their password? The link works once, for 1 hour.',
    )
  })

  it('says a resend keeps the current password working until a new one is chosen', () => {
    expect(loginInstructionsConfirmText('password_set', 'Alice Example')).toBe(
      'Alice Example already has a password. Resending emails a new set-password link; their current password keeps working until they choose a new one.',
    )
  })

  it('warns that the earlier link stops working when resending to a waiting student', () => {
    expect(loginInstructionsConfirmText('waiting', 'Carol Example')).toBe(
      'Send a new set-password link? The earlier link stops working.',
    )
  })
})
