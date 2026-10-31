import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../actions/delete-item', () => ({ deleteItem: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { DeleteButton } from './delete-button'

function setup(questionCount: number) {
  return render(
    <DeleteButton id="i-1" table="easa_topics" label="Topic" questionCount={questionCount} />,
  )
}

describe('syllabus DeleteButton tooltip', () => {
  it('disables the button and names it with the question count when questions reference it', () => {
    setup(3)
    const btn = screen.getByRole('button', { name: /3 questions/ })
    expect(btn).toBeDisabled()
    expect(btn).not.toHaveAttribute('title')
  })

  it('shows the reason when hovering the wrapper span of the disabled button', async () => {
    setup(3)
    const btn = screen.getByRole('button', { name: /3 questions/ })
    const wrapper = btn.closest('span') as HTMLElement
    expect(wrapper).not.toBeNull()
    await userEvent.setup().hover(wrapper)
    const tip = await screen.findByRole('tooltip', {}, { timeout: 1500 })
    expect(tip).toHaveTextContent('3 questions reference this item')
  })

  it('says "Delete" in the tooltip when nothing references the item', async () => {
    setup(0)
    const btn = screen.getByRole('button', { name: 'Delete' })
    expect(btn).toBeEnabled()
    await userEvent.setup().hover(btn)
    const tip = await screen.findByRole('tooltip', {}, { timeout: 1500 })
    expect(tip).toHaveTextContent('Delete')
  })

  it('shows no tooltip on touch pointer', async () => {
    setup(3)
    const wrapper = screen
      .getByRole('button', { name: /3 questions/ })
      .closest('span') as HTMLElement
    fireEvent.pointerEnter(wrapper, { pointerType: 'touch' })
    await new Promise((r) => setTimeout(r, 800))
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
})
