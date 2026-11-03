import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import SettingsPage from './page'

vi.mock('./_components/settings-content', () => ({ SettingsContent: () => null }))
vi.mock('./_components/settings-content-skeleton', () => ({ SettingsContentSkeleton: () => null }))

describe('SettingsPage', () => {
  it('renders the Settings title in the shared page header', () => {
    render(<SettingsPage />)

    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toHaveClass('text-title')
  })
})
