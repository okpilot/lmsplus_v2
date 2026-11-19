import { describe, expect, it } from 'vitest'
import { sittingModeLabel } from './sitting-mode-label'

describe('sittingModeLabel', () => {
  it('labels remote as Remote', () => {
    expect(sittingModeLabel('remote')).toBe('Remote')
  })
  it('labels in_person as In person', () => {
    expect(sittingModeLabel('in_person')).toBe('In person')
  })
})
