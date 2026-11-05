import { describe, expect, it } from 'vitest'
import type { QuestionOption } from '../types'
import { buildOptionSlots, withOptionText } from './option-slots'

const ids = (options: QuestionOption[]) => buildOptionSlots(options).map((s) => s.id)

describe('buildOptionSlots', () => {
  it('assigns ids a to d to an ordered full set', () => {
    const options = ['a', 'b', 'c', 'd'].map((id) => ({ id, text: id }))
    expect(ids(options as QuestionOption[])).toEqual(['a', 'b', 'c', 'd'])
  })

  it('keeps the stored ids in stored order for a shuffled set', () => {
    const options = ['b', 'a', 'c', 'd'].map((id) => ({ id, text: id }))
    expect(ids(options as QuestionOption[])).toEqual(['b', 'a', 'c', 'd'])
  })

  it('gives the empty fourth slot the unused id when a letter is skipped', () => {
    const options = ['a', 'b', 'd'].map((id) => ({ id, text: id }))
    expect(ids(options as QuestionOption[])).toEqual(['a', 'b', 'd', 'c'])
  })

  it('assigns ids a to d when there are no options', () => {
    expect(ids([])).toEqual(['a', 'b', 'c', 'd'])
  })

  it('pairs each slot with its display letter', () => {
    expect(buildOptionSlots([]).map((s) => s.letter)).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('withOptionText', () => {
  it('emits four options with the unused id on the edited fourth row of a gapped set', () => {
    const options = [
      { id: 'a', text: 'Alpha' },
      { id: 'b', text: 'Beta' },
      { id: 'd', text: 'Delta' },
    ] as QuestionOption[]
    const emitted = withOptionText(options, 3, 'Gamma')
    expect(emitted).toEqual([
      { id: 'a', text: 'Alpha' },
      { id: 'b', text: 'Beta' },
      { id: 'd', text: 'Delta' },
      { id: 'c', text: 'Gamma' },
    ])
  })
})
