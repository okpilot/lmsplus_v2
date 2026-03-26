import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../actions', () => ({
  updateDisplayName: vi.fn(),
  changePassword: vi.fn(),
}))

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
})
