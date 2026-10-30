import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/queries/profile', () => ({
  getProfileData: async () => ({
    fullName: 'Alice Pilot',
    email: 'alice@example.com',
    organizationName: 'Sky Academy',
    memberSince: '2026-01-01T00:00:00Z',
  }),
}))
vi.mock('./change-password-form', () => ({ ChangePasswordForm: () => <p>password form</p> }))
vi.mock('./edit-name-form', () => ({ EditNameForm: () => <p>name form</p> }))
vi.mock('../gdpr-actions', () => ({ exportMyData: vi.fn() }))

import { SettingsContent } from './settings-content'

describe('SettingsContent', () => {
  it('puts Profile and Your Data in one two-column band', async () => {
    render(await SettingsContent())
    const band = screen.getByText('Profile').closest('[data-slot="card"]') as HTMLElement
    expect(band).toContainElement(screen.getByText('Your Data'))
    expect(band.className).toContain('lg:grid-cols-2')
  })

  it('places Display Name and Change Password side by side below the band', async () => {
    render(await SettingsContent())
    const row = screen.getByText('name form').parentElement as HTMLElement
    expect(row).toContainElement(screen.getByText('password form'))
    expect(row.className).toContain('lg:grid-cols-2')
  })

  it('renders no Quiz Statistics section', async () => {
    render(await SettingsContent())
    expect(screen.queryByText('Quiz Statistics')).not.toBeInTheDocument()
  })
})
