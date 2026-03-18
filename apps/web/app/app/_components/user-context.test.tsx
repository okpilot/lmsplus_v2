import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { UserProvider, useUser } from './user-context'

function ConsumerComponent() {
  const { displayName, userRole } = useUser()
  return (
    <div>
      <span data-testid="display-name">{displayName}</span>
      <span data-testid="user-role">{userRole ?? 'none'}</span>
    </div>
  )
}

function ThrowingComponent() {
  useUser()
  return null
}

describe('UserContext', () => {
  it('provides displayName and userRole to consumers', () => {
    render(
      <UserProvider displayName="Ada Pilot" userRole="student">
        <ConsumerComponent />
      </UserProvider>,
    )

    expect(screen.getByTestId('display-name')).toHaveTextContent('Ada Pilot')
    expect(screen.getByTestId('user-role')).toHaveTextContent('student')
  })

  it('works without userRole (optional field)', () => {
    render(
      <UserProvider displayName="Ada Pilot">
        <ConsumerComponent />
      </UserProvider>,
    )

    expect(screen.getByTestId('display-name')).toHaveTextContent('Ada Pilot')
    expect(screen.getByTestId('user-role')).toHaveTextContent('none')
  })

  it('throws when useUser is called outside a UserProvider', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<ThrowingComponent />)).toThrow('useUser must be used within UserProvider')
    consoleSpy.mockRestore()
  })
})
