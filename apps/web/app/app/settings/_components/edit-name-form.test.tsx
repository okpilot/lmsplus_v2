import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../actions', () => ({
  updateDisplayName: vi.fn(),
  changePassword: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { toast } from 'sonner'
import { updateDisplayName } from '../actions'
import { EditNameForm } from './edit-name-form'

describe('EditNameForm', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders the display name card heading', () => {
    render(<EditNameForm currentName="Alice Smith" />)
    expect(screen.getByText('Display Name')).toBeInTheDocument()
  })

  it('renders the name input pre-filled with the current name', () => {
    render(<EditNameForm currentName="Alice Smith" />)
    expect(screen.getByDisplayValue('Alice Smith')).toBeInTheDocument()
  })

  it('renders an empty input when currentName is null', () => {
    render(<EditNameForm currentName={null} />)
    const input = screen.getByLabelText(/full name/i)
    expect(input).toHaveValue('')
  })

  it('renders the save button', () => {
    render(<EditNameForm currentName="Alice Smith" />)
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument()
  })

  it('disables the save button when the name is unchanged', () => {
    render(<EditNameForm currentName="Alice Smith" />)
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
  })

  it('enables the save button when the name is changed', async () => {
    const user = userEvent.setup()
    render(<EditNameForm currentName="Alice Smith" />)

    const input = screen.getByLabelText(/full name/i)
    await user.clear(input)
    await user.type(input, 'Bob Jones')

    expect(screen.getByRole('button', { name: /save/i })).not.toBeDisabled()
  })

  it('shows a validation error when the name is cleared before submitting', async () => {
    const user = userEvent.setup()
    render(<EditNameForm currentName="Alice Smith" />)

    const input = screen.getByLabelText(/full name/i)
    await user.clear(input)
    await user.type(input, ' ')
    await user.click(screen.getByRole('button', { name: /save/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Name is required')
    expect(updateDisplayName).not.toHaveBeenCalled()
  })

  it('saves the updated name and shows a success toast when the form is valid', async () => {
    vi.mocked(updateDisplayName).mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(<EditNameForm currentName="Alice Smith" />)

    const input = screen.getByLabelText(/full name/i)
    await user.clear(input)
    await user.type(input, 'New Name')
    await user.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(updateDisplayName).toHaveBeenCalledWith({ fullName: 'New Name' })
      expect(toast.success).toHaveBeenCalledWith('Name updated')
    })
  })

  it('shows the returned error message when saving the name fails', async () => {
    vi.mocked(updateDisplayName).mockResolvedValue({ success: false, error: 'Update failed' })
    const user = userEvent.setup()
    render(<EditNameForm currentName="Alice Smith" />)

    const input = screen.getByLabelText(/full name/i)
    await user.clear(input)
    await user.type(input, 'New Name')
    await user.click(screen.getByRole('button', { name: /save/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Update failed')
  })

  it('shows a fallback error message when the save request fails unexpectedly', async () => {
    vi.mocked(updateDisplayName).mockRejectedValue(new Error('Network error'))
    const user = userEvent.setup()
    render(<EditNameForm currentName="Alice Smith" />)

    const input = screen.getByLabelText(/full name/i)
    await user.clear(input)
    await user.type(input, 'New Name')
    await user.click(screen.getByRole('button', { name: /save/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to update name')
  })
})
