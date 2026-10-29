import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { simulateTranslator } from '@/lib/test-support/simulate-translator'
import { QuizNavBar } from './quiz-nav-bar'

describe('QuizNavBar under browser auto-translate', () => {
  it.each([false, true])('shows the submit spinner on a translated page (exam: %s)', (isExam) => {
    const props = {
      currentIndex: 0,
      totalQuestions: 3,
      action: 'submit' as const,
      canSubmit: true,
      isExam,
      onPrev: vi.fn(),
      onNext: vi.fn(),
      onSubmit: vi.fn(),
    }
    const { container, rerender } = render(<QuizNavBar {...props} submitting={false} />)
    simulateTranslator(container)

    expect(() => rerender(<QuizNavBar {...props} submitting />)).not.toThrow()
    expect(container.querySelector('.animate-spin')).not.toBeNull()
  })
})
