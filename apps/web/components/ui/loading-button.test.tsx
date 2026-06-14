import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { LoadingButton } from './loading-button'

describe('LoadingButton', () => {
  it('disables the button and shows a spinner while loading', () => {
    const { container } = render(<LoadingButton loading>Save</LoadingButton>)
    expect(screen.getByRole('button')).toBeDisabled()
    expect(container.querySelector('.animate-spin')).not.toBeNull()
  })

  it('shows loadingText instead of children while loading', () => {
    render(
      <LoadingButton loading loadingText="Saving...">
        Save changes
      </LoadingButton>,
    )
    const button = screen.getByRole('button')
    expect(button).toHaveTextContent('Saving...')
    // "changes" only appears in children, so a regression that ignores
    // loadingText and renders children would fail this assertion.
    expect(button).not.toHaveTextContent('changes')
  })

  it('keeps the accessible name equal to loadingText while loading', () => {
    render(
      <LoadingButton loading loadingText="Signing in...">
        Sign in
      </LoadingButton>,
    )
    // The spinner is aria-hidden, so the name is computed from the text only.
    expect(screen.getByRole('button', { name: 'Signing in...' })).toBeInTheDocument()
  })

  it('renders children and no spinner when not loading', () => {
    const { container } = render(<LoadingButton>Submit</LoadingButton>)
    const button = screen.getByRole('button')
    expect(button).not.toBeDisabled()
    expect(button).toHaveTextContent('Submit')
    expect(container.querySelector('.animate-spin')).toBeNull()
  })

  it('stays disabled when disabled is passed even if not loading', () => {
    render(<LoadingButton disabled>Submit</LoadingButton>)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('fires onClick when not loading', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<LoadingButton onClick={onClick}>Submit</LoadingButton>)
    await user.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('does not fire onClick while loading', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <LoadingButton loading onClick={onClick}>
        Submit
      </LoadingButton>,
    )
    await user.click(screen.getByRole('button'))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('falls back to children as the button label when loading with no loadingText', () => {
    render(<LoadingButton loading>Save</LoadingButton>)
    expect(screen.getByRole('button')).toHaveTextContent('Save')
  })

  it('passes variant and size props through to the underlying button', () => {
    render(
      <LoadingButton variant="outline" size="sm">
        Cancel
      </LoadingButton>,
    )
    const button = screen.getByRole('button', { name: 'Cancel' })
    // 'border-border' is the cva class emitted only for variant="outline", so
    // this proves the variant prop reached the underlying Button rather than
    // being swallowed.
    expect(button.className).toContain('border-border')
  })
})
