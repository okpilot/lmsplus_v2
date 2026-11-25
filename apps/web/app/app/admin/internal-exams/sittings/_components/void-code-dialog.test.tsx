import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { VoidCodeDialog } from './void-code-dialog'

const onConfirm = vi.fn()
const onOpenChange = vi.fn()

function ui(over: Partial<Parameters<typeof VoidCodeDialog>[0]> = {}) {
  return render(
    <VoidCodeDialog
      open
      onOpenChange={onOpenChange}
      title="Void code for FPM, Ann?"
      emailed={false}
      pending={false}
      error={null}
      onConfirm={onConfirm}
      {...over}
    />,
  )
}

describe('VoidCodeDialog', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('confirms with the reason trimmed', async () => {
    const user = userEvent.setup()
    ui()
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByRole('textbox'), '  Wrong person  ')
    await user.click(within(dialog).getByRole('button', { name: 'Void code' }))
    expect(onConfirm).toHaveBeenCalledWith('Wrong person')
  })

  it('keeps Void code disabled for a whitespace-only reason', async () => {
    const user = userEvent.setup()
    ui()
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByRole('textbox'), '   ')
    expect(within(dialog).getByRole('button', { name: 'Void code' })).toBeDisabled()
  })

  it('caps the reason at 500 characters', () => {
    ui()
    expect(screen.getByRole('textbox')).toHaveAttribute('maxlength', '500')
  })

  it('closes on Cancel', async () => {
    const user = userEvent.setup()
    ui()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('shows the error in an alert', () => {
    ui({ error: 'Code already used' })
    expect(screen.getByRole('alert')).toHaveTextContent('Code already used')
  })
})
