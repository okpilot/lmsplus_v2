import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NewVersionDialog } from './new-version-dialog'

const onReload = vi.fn()
const onLater = vi.fn()

function setup(open = true) {
  render(<NewVersionDialog open={open} onReload={onReload} onLater={onLater} />)
}

describe('NewVersionDialog', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('explains that a new version is available', () => {
    setup()
    expect(screen.getByText('A new version is available')).toBeInTheDocument()
    expect(
      screen.getByText(
        "We've made some improvements to the app. Reload the page to get the new version.",
      ),
    ).toBeInTheDocument()
  })

  it('renders nothing when closed', () => {
    setup(false)
    expect(screen.queryByText('A new version is available')).not.toBeInTheDocument()
  })

  it('reloads when Reload now is clicked', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Reload now' }))
    expect(onReload).toHaveBeenCalledOnce()
    expect(onLater).not.toHaveBeenCalled()
  })

  it('postpones once when Later is clicked', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Later' }))
    expect(onLater).toHaveBeenCalledOnce()
    expect(onReload).not.toHaveBeenCalled()
  })

  it('postpones when Escape is pressed', async () => {
    setup()
    await userEvent.keyboard('{Escape}')
    expect(onLater).toHaveBeenCalledOnce()
  })
})
