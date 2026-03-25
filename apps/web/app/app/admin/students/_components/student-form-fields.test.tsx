import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock Base UI Select to avoid portal complexity in jsdom.
vi.mock('@/components/ui/select', () => ({
  Select: ({
    value,
    disabled,
    children,
  }: {
    value: string
    disabled?: boolean
    onValueChange: (v: string) => void
    children: React.ReactNode
    items?: { value: string; label: string }[]
  }) => (
    <div data-testid="select" data-value={value} data-disabled={disabled ? 'true' : undefined}>
      {children}
    </div>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <div data-value={value}>{children}</div>
  ),
}))

import { StudentFormFields } from './student-form-fields'

const BASE_PROPS = {
  isEdit: false,
  isPending: false,
  email: 'alice@example.com',
  fullName: 'Alice',
  role: 'student',
  tempPassword: 'pass123',
  onEmailChange: vi.fn(),
  onFullNameChange: vi.fn(),
  onRoleChange: vi.fn(),
  onTempPasswordChange: vi.fn(),
}

describe('StudentFormFields', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders the email, full name, role, and temporary password fields in create mode', () => {
    render(<StudentFormFields {...BASE_PROPS} />)
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Full name')).toBeInTheDocument()
    expect(screen.getByText('Role')).toBeInTheDocument()
    expect(screen.getByLabelText('Temporary password')).toBeInTheDocument()
  })

  it('hides the temporary password field in edit mode', () => {
    render(<StudentFormFields {...BASE_PROPS} isEdit={true} />)
    expect(screen.queryByLabelText('Temporary password')).not.toBeInTheDocument()
  })

  it('disables the email field in edit mode', () => {
    render(<StudentFormFields {...BASE_PROPS} isEdit={true} />)
    expect(screen.getByLabelText('Email')).toBeDisabled()
  })

  it('enables the email field in create mode', () => {
    render(<StudentFormFields {...BASE_PROPS} isEdit={false} />)
    expect(screen.getByLabelText('Email')).not.toBeDisabled()
  })

  it('shows the Admin role option only in edit mode', () => {
    render(<StudentFormFields {...BASE_PROPS} isEdit={true} />)
    expect(screen.getByText('Admin')).toBeInTheDocument()
  })

  it('does not show the Admin role option in create mode', () => {
    render(<StudentFormFields {...BASE_PROPS} isEdit={false} />)
    expect(screen.queryByText('Admin')).not.toBeInTheDocument()
  })

  it('always shows the Instructor and Student role options', () => {
    render(<StudentFormFields {...BASE_PROPS} isEdit={false} />)
    expect(screen.getByText('Instructor')).toBeInTheDocument()
    expect(screen.getByText('Student')).toBeInTheDocument()
  })

  it('disables the role select when isPending is true', () => {
    render(<StudentFormFields {...BASE_PROPS} isPending={true} />)
    const roleSelect = screen.getByTestId('select')
    expect(roleSelect).toHaveAttribute('data-disabled', 'true')
  })

  it('disables all inputs when isPending is true', () => {
    render(<StudentFormFields {...BASE_PROPS} isPending={true} />)
    // email input and full name input both disabled when isPending
    expect(screen.getByLabelText('Email')).toBeDisabled()
    expect(screen.getByLabelText('Full name')).toBeDisabled()
    expect(screen.getByLabelText('Temporary password')).toBeDisabled()
  })
})
