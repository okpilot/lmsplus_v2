import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../actions/soft-delete-question', () => ({ softDeleteQuestion: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { DeleteQuestionButton } from './delete-question-button'

describe('DeleteQuestionButton tooltip (real Base UI triggers)', () => {
  it('keeps the accessible name "Delete question" without a title attribute', () => {
    render(<DeleteQuestionButton id="q-1" label="Q001" />)
    const btn = screen.getByRole('button', { name: 'Delete question' })
    expect(btn).not.toHaveAttribute('title')
  })

  it('shows the tooltip "Delete question" after hover', async () => {
    render(<DeleteQuestionButton id="q-1" label="Q001" />)
    await userEvent.setup().hover(screen.getByRole('button', { name: 'Delete question' }))
    const tip = await screen.findByRole('tooltip', {}, { timeout: 1500 })
    expect(tip).toHaveTextContent('Delete question')
  })

  it('still opens the confirmation dialog on click', async () => {
    render(<DeleteQuestionButton id="q-1" label="Q001" />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Delete question' }))
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()
  })
})
