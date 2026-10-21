import { render, screen } from '@testing-library/react'
import { Suspense } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { ShellUser } from '../_lib/load-shell-user'
import { UserProvider, useUser } from './user-context'

const fulfilled = <T,>(v: T) =>
  Object.assign(Promise.resolve(v), { status: 'fulfilled' as const, value: v })

function ConsumerComponent() {
  const user = useUser()
  return (
    <div>
      <span data-testid="display-name">{user?.displayName ?? 'none'}</span>
      <span data-testid="user-role">{user?.userRole ?? 'none'}</span>
    </div>
  )
}

function ThrowingComponent() {
  useUser()
  return null
}

describe('UserContext', () => {
  it('provides displayName and userRole to consumers once the lookup has resolved', () => {
    const user: ShellUser = { displayName: 'Ada Pilot', userRole: 'student' }
    render(
      <UserProvider user={fulfilled(user)}>
        <ConsumerComponent />
      </UserProvider>,
    )

    expect(screen.getByTestId('display-name')).toHaveTextContent('Ada Pilot')
    expect(screen.getByTestId('user-role')).toHaveTextContent('student')
  })

  it('provides null to consumers when the lookup resolved without a user', () => {
    render(
      <UserProvider user={fulfilled(null)}>
        <ConsumerComponent />
      </UserProvider>,
    )

    expect(screen.getByTestId('display-name')).toHaveTextContent('none')
  })

  it('shows the Suspense fallback while the lookup is pending', () => {
    render(
      <UserProvider user={new Promise(() => {})}>
        <Suspense fallback={<span>loading</span>}>
          <ConsumerComponent />
        </Suspense>
      </UserProvider>,
    )

    expect(screen.getByText('loading')).toBeInTheDocument()
    expect(screen.queryByTestId('display-name')).not.toBeInTheDocument()
  })

  it('throws when useUser is called outside a UserProvider', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<ThrowingComponent />)).toThrow('useUser must be used within UserProvider')
    consoleSpy.mockRestore()
  })
})
