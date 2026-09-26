import { describe, expect, it } from 'vitest'
import {
  computeLoginInstructionsState,
  loginInstructionsConfirmText,
  loginInstructionsStateLabel,
} from './login-instructions-state'

const NOW = new Date('2026-06-15T12:00:00.000Z')

describe('computeLoginInstructionsState', () => {
  it('reports not_sent when login instructions were never sent', () => {
    expect(computeLoginInstructionsState({ sentAt: null, expiresAt: null }, NOW)).toBe('not_sent')
  })

  it('reports password_set when sent but no temporary password is armed', () => {
    expect(
      computeLoginInstructionsState({ sentAt: '2026-06-01T00:00:00.000Z', expiresAt: null }, NOW),
    ).toBe('password_set')
  })

  it('reports expired when the temporary password expiry is in the past', () => {
    expect(
      computeLoginInstructionsState(
        { sentAt: '2026-06-01T00:00:00.000Z', expiresAt: '2026-06-10T00:00:00.000Z' },
        NOW,
      ),
    ).toBe('expired')
  })

  it('reports expired when the expiry is exactly now', () => {
    expect(
      computeLoginInstructionsState(
        { sentAt: '2026-06-01T00:00:00.000Z', expiresAt: NOW.toISOString() },
        NOW,
      ),
    ).toBe('expired')
  })

  it('reports waiting when the temporary password has not yet expired', () => {
    expect(
      computeLoginInstructionsState(
        { sentAt: '2026-06-14T00:00:00.000Z', expiresAt: '2026-06-21T00:00:00.000Z' },
        NOW,
      ),
    ).toBe('waiting')
  })
})

describe('loginInstructionsStateLabel', () => {
  it('labels not_sent as "Not sent yet"', () => {
    expect(loginInstructionsStateLabel('not_sent', null)).toBe('Not sent yet')
  })

  it('labels waiting with the formatted expiry date', () => {
    const label = loginInstructionsStateLabel('waiting', '2026-06-21T00:00:00.000Z')
    expect(label).toBe(
      `Waiting (valid until ${new Date('2026-06-21T00:00:00.000Z').toLocaleString('en-GB', { dateStyle: 'medium' })})`,
    )
  })

  it('labels expired as "Expired"', () => {
    expect(loginInstructionsStateLabel('expired', '2026-06-10T00:00:00.000Z')).toBe('Expired')
  })

  it('labels password_set as "Password set"', () => {
    expect(loginInstructionsStateLabel('password_set', null)).toBe('Password set')
  })
})

describe('loginInstructionsConfirmText', () => {
  it('warns that resending replaces an existing self-chosen password', () => {
    expect(loginInstructionsConfirmText('password_set', 'Alice Example')).toBe(
      'Alice Example has their own password. Resending replaces it with a new temporary one.',
    )
  })

  it('warns that any password in use now stops working on a first send', () => {
    expect(loginInstructionsConfirmText('not_sent', 'Bob Example')).toBe(
      'Send login instructions to Bob Example? Any password they use now stops working.',
    )
  })

  it('warns that the earlier temporary password stops working when waiting', () => {
    expect(loginInstructionsConfirmText('waiting', 'Carol Example')).toBe(
      'Send a new temporary password? The earlier one stops working.',
    )
  })

  it('warns that the earlier temporary password stops working when expired', () => {
    expect(loginInstructionsConfirmText('expired', 'Dana Example')).toBe(
      'Send a new temporary password? The earlier one stops working.',
    )
  })
})
