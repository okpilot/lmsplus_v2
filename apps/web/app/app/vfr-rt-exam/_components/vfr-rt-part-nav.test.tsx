import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { VfrRtPartNav } from './vfr-rt-part-nav'

function renderNav(props?: Partial<Parameters<typeof VfrRtPartNav>[0]>) {
  const onPrev = vi.fn()
  const onNext = vi.fn()
  render(
    <VfrRtPartNav
      currentIndex={props?.currentIndex ?? 1}
      total={props?.total ?? 3}
      partLabel={props?.partLabel ?? 'Part 1'}
      onPrev={props?.onPrev ?? onPrev}
      onNext={props?.onNext ?? onNext}
    />,
  )
  return { onPrev, onNext }
}

describe('VfrRtPartNav', () => {
  it('disables Previous on the first question', () => {
    renderNav({ currentIndex: 0 })
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled()
  })

  it('disables Next on the last question', () => {
    renderNav({ currentIndex: 2, total: 3 })
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled()
  })

  it('invokes onPrev when Previous is clicked', async () => {
    const { onPrev } = renderNav({ currentIndex: 1 })
    await userEvent.click(screen.getByRole('button', { name: /previous/i }))
    expect(onPrev).toHaveBeenCalledOnce()
  })

  it('invokes onNext when Next is clicked', async () => {
    const { onNext } = renderNav({ currentIndex: 1 })
    await userEvent.click(screen.getByRole('button', { name: /next/i }))
    expect(onNext).toHaveBeenCalledOnce()
  })

  it('shows the current position and part label', () => {
    renderNav({ currentIndex: 1, total: 3, partLabel: 'Part 2' })
    expect(screen.getByText('Question 2 of 3 · Part 2')).toBeInTheDocument()
  })

  it('disables both buttons and shows "Question 0 of 0" when there are no questions', () => {
    renderNav({ currentIndex: 0, total: 0, partLabel: 'Part 1' })
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled()
    expect(screen.getByText('Question 0 of 0 · Part 1')).toBeInTheDocument()
  })
})
