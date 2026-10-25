import { render } from '@testing-library/react'
import { Component, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockUseUser } = vi.hoisted(() => ({ mockUseUser: vi.fn() }))
vi.mock('./user-context', () => ({ useUser: () => mockUseUser() }))

import { ActiveUserGate } from './active-user-gate'

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? <span data-testid="caught" /> : this.props.children
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('ActiveUserGate', () => {
  it('reads the shell user and renders nothing', () => {
    mockUseUser.mockReturnValue({ displayName: 'A', userRole: 'student' })

    const { container } = render(<ActiveUserGate />)

    expect(mockUseUser).toHaveBeenCalledTimes(1)
    expect(container.innerHTML).toBe('')
  })

  it('surfaces a rejected shell-user lookup (the sign-out redirect) to the error boundary', () => {
    mockUseUser.mockImplementation(() => {
      throw new Error('NEXT_REDIRECT')
    })

    const { getByTestId } = render(
      <Boundary>
        <ActiveUserGate />
      </Boundary>,
    )

    expect(getByTestId('caught')).toBeInTheDocument()
  })
})
