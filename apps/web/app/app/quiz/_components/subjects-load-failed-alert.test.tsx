import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SubjectsLoadFailedAlert } from './subjects-load-failed-alert'

describe('SubjectsLoadFailedAlert', () => {
  it('calls onRetry when Try again is clicked', async () => {
    const onRetry = vi.fn()
    render(<SubjectsLoadFailedAlert onRetry={onRetry} />)

    expect(screen.getByRole('alert')).toHaveTextContent('Quiz subjects could not be loaded.')
    await userEvent.setup({ delay: null }).click(screen.getByRole('button', { name: 'Try again' }))

    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('disables Try again while pending', () => {
    render(<SubjectsLoadFailedAlert onRetry={vi.fn()} pending />)

    expect(screen.getByRole('button', { name: 'Try again' })).toBeDisabled()
  })

  it('enables Try again when not pending', () => {
    render(<SubjectsLoadFailedAlert onRetry={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled()
  })
})
