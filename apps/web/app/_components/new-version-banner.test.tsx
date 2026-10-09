import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NewVersionBanner } from './new-version-banner'

const onReload = vi.fn()

describe('NewVersionBanner', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('announces that a new version is available', () => {
    render(<NewVersionBanner onReload={onReload} />)
    expect(screen.getByRole('status')).toHaveTextContent('A new version is available.')
  })

  it('reloads when Reload is clicked', async () => {
    render(<NewVersionBanner onReload={onReload} />)
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(onReload).toHaveBeenCalledOnce()
  })

  it('offers no way to dismiss it', () => {
    render(<NewVersionBanner onReload={onReload} />)
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })
})
