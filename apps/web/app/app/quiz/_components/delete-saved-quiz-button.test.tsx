import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DeleteSavedQuizButton } from './delete-saved-quiz-button'

const NAME = 'Delete this saved quiz?'

function setup(
  onConfirm: () => Promise<void>,
  extra: { pending?: boolean; disabled?: boolean } = {},
) {
  return render(
    <DeleteSavedQuizButton
      testId="del"
      onConfirm={onConfirm}
      pending={extra.pending ?? false}
      disabled={extra.disabled}
    />,
  )
}

describe('DeleteSavedQuizButton', () => {
  it('renders a Delete trigger with the given test id and no dialog initially', () => {
    setup(vi.fn().mockResolvedValue(undefined))
    expect(screen.getByTestId('del')).toHaveTextContent('Delete')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('shows the label prop on the trigger', () => {
    render(<DeleteSavedQuizButton label="Deleting..." onConfirm={vi.fn()} pending={false} />)
    expect(screen.getByRole('button', { name: 'Deleting...' })).toBeInTheDocument()
  })

  it('opens an alertdialog with the fixed title, description, Cancel and Delete', async () => {
    setup(vi.fn().mockResolvedValue(undefined))
    fireEvent.click(screen.getByTestId('del'))

    const dialog = await screen.findByRole('alertdialog', { name: NAME })
    expect(within(dialog).getByText('This cannot be undone.')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('closes on Cancel without calling onConfirm', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    setup(onConfirm)
    fireEvent.click(screen.getByTestId('del'))
    const dialog = await screen.findByRole('alertdialog', { name: NAME })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('calls onConfirm once and closes after it resolves', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    setup(onConfirm)
    fireEvent.click(screen.getByTestId('del'))
    const dialog = await screen.findByRole('alertdialog', { name: NAME })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  })

  it('stays open and ignores a second Confirm while onConfirm is unresolved', async () => {
    const onConfirm = vi.fn().mockReturnValue(new Promise(() => {}))
    setup(onConfirm)
    fireEvent.click(screen.getByTestId('del'))
    const dialog = await screen.findByRole('alertdialog', { name: NAME })
    const confirm = within(dialog).getByRole('button', { name: 'Delete' })
    fireEvent.click(confirm)
    fireEvent.click(confirm)

    expect(onConfirm).toHaveBeenCalledTimes(1)
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled(),
    )
    expect(screen.getByRole('alertdialog', { name: NAME })).toBeInTheDocument()
  })

  it('disables both dialog buttons when pending is true', async () => {
    setup(vi.fn().mockResolvedValue(undefined), { pending: true })
    fireEvent.click(screen.getByTestId('del'))
    const dialog = await screen.findByRole('alertdialog', { name: NAME })

    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: /Delete/ })).toBeDisabled()
  })

  it('disables the trigger when disabled is true', () => {
    setup(vi.fn().mockResolvedValue(undefined), { disabled: true })
    expect(screen.getByTestId('del')).toBeDisabled()
  })

  it('closes the dialog after onConfirm rejects', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('boom'))
    setup(onConfirm)
    fireEvent.click(screen.getByTestId('del'))
    const dialog = await screen.findByRole('alertdialog', { name: NAME })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})
