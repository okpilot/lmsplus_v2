import { describe, expect, it } from 'vitest'
import { ROLE_LABELS, roleLabel } from './roles'

describe('roleLabel', () => {
  it.each(Object.entries(ROLE_LABELS))('maps %s to %s', (role, label) => {
    expect(roleLabel(role)).toBe(label)
  })

  it('falls back to the raw value', () => {
    expect(roleLabel('guest')).toBe('guest')
  })
})
