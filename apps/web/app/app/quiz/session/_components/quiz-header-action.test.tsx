import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockExit } = vi.hoisted(() => ({ mockExit: vi.fn() }))
vi.mock('../_hooks/use-discovery-exit', () => ({ useDiscoveryExit: () => mockExit }))

import { QuizHeaderAction } from './quiz-header-action'

describe('QuizHeaderAction', () => {
  beforeEach(() => vi.resetAllMocks())

  it('labels the button Finish Test for practice and calls onFinishClick', async () => {
    const onFinishClick = vi.fn()
    render(<QuizHeaderAction isExam={false} submitting={false} onFinishClick={onFinishClick} />)
    await userEvent.click(screen.getByRole('button', { name: 'Finish Test' }))
    expect(onFinishClick).toHaveBeenCalledTimes(1)
  })

  it('labels the button with the exam mode name in an exam', () => {
    render(
      <QuizHeaderAction
        isExam
        examMode="internal_exam"
        submitting={false}
        onFinishClick={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Finish Internal Exam' })).toBeInTheDocument()
  })

  it('falls back to the Practice Exam label when an exam has no mode', () => {
    render(<QuizHeaderAction isExam submitting={false} onFinishClick={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Finish Practice Exam' })).toBeInTheDocument()
  })

  it('disables the button and marks it busy while submitting', () => {
    render(<QuizHeaderAction isExam={false} submitting onFinishClick={vi.fn()} />)
    const btn = screen.getByRole('button', { name: 'Finish Test' })
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('aria-busy', 'true')
  })

  it('shows Exit instead of Finish in Discovery and opens the exit confirm without leaving', async () => {
    const onFinishClick = vi.fn()
    const onExitClick = vi.fn()
    render(
      <QuizHeaderAction
        isExam={false}
        isDiscovery
        submitting={false}
        onFinishClick={onFinishClick}
        onExitClick={onExitClick}
      />,
    )
    expect(screen.queryByRole('button', { name: /Finish/ })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Exit' }))
    expect(onExitClick).toHaveBeenCalledTimes(1)
    expect(onFinishClick).not.toHaveBeenCalled()
    expect(mockExit).not.toHaveBeenCalled()
  })
})
