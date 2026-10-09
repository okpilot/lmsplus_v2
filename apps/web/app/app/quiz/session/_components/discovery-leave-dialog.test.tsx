import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockExit, state } = vi.hoisted(() => ({ mockExit: vi.fn(), state: { leaving: false } }))
vi.mock('../_hooks/use-discovery-exit', () => ({
  useDiscoveryExit: () => ({ exit: mockExit, leaving: state.leaving }),
}))

import { DiscoveryLeaveDialog } from './discovery-leave-dialog'

function setup(open = true) {
  const onOpenChange = vi.fn()
  render(<DiscoveryLeaveDialog open={open} onOpenChange={onOpenChange} />)
  return { onOpenChange }
}

describe('DiscoveryLeaveDialog', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    state.leaving = false
  })

  it('asks whether to leave discovery and explains nothing is scored', () => {
    setup()
    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toHaveTextContent('Leave discovery?')
    expect(dialog).toHaveTextContent('Nothing is scored.')
  })

  it('renders nothing while closed', () => {
    setup(false)
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('stays in the runner when Stay is chosen', async () => {
    const { onOpenChange } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Stay' }))
    expect(onOpenChange).toHaveBeenCalledWith(false, expect.anything())
    expect(mockExit).not.toHaveBeenCalled()
  })

  it('leaves discovery when Leave is chosen', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Leave' }))
    expect(mockExit).toHaveBeenCalledTimes(1)
  })

  it('closes the dialog on Escape while no exit is pending', async () => {
    const { onOpenChange } = setup()
    await userEvent.keyboard('{Escape}')
    expect(onOpenChange).toHaveBeenCalledWith(false, expect.anything())
  })

  describe('while the exit is pending', () => {
    beforeEach(() => {
      state.leaving = true
    })

    it('keeps the dialog open on Escape', async () => {
      const { onOpenChange } = setup()
      await userEvent.keyboard('{Escape}')
      expect(onOpenChange).not.toHaveBeenCalled()
      expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    })

    it('disables Stay and Leave', () => {
      setup()
      expect(screen.getByRole('button', { name: 'Stay' })).toBeDisabled()
      expect(screen.getByRole('button', { name: /Leave/ })).toBeDisabled()
    })
  })
})
