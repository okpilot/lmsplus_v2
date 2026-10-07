import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { simulateTranslator } from '@/lib/test-support/simulate-translator'
import { AnswerOptions } from './answer-options'

const OPTIONS = [
  { id: 'a', text: 'Option Alpha' },
  { id: 'b', text: 'Option Beta' },
]

describe('AnswerOptions under browser auto-translate', () => {
  it.each([false, true])('shows the submit spinner on a translated page (exam: %s)', (isExam) => {
    const props = { options: OPTIONS, onSubmit: vi.fn(), disabled: false, isExam }
    const { container, rerender } = render(<AnswerOptions {...props} submitting={false} />)
    simulateTranslator(container)

    expect(() => rerender(<AnswerOptions {...props} submitting />)).not.toThrow()
    expect(container.querySelector('.animate-spin')).not.toBeNull()
  })
})
