import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => '/app/admin/internal-exams/sittings/sit-1',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { SittingUiProvider, useSittingUi } from '../_hooks/sitting-ui-context'
import { ResultBanner } from './result-banner'

let setBannerRef: ReturnType<typeof useSittingUi>['setBanner']

function Capture() {
  setBannerRef = useSittingUi().setBanner
  return null
}

function ui() {
  return render(
    <SittingUiProvider>
      <Capture />
      <ResultBanner />
    </SittingUiProvider>,
  )
}

describe('ResultBanner', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders nothing when there is no banner', () => {
    ui()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('uses role alert for a danger banner with its detail', () => {
    ui()
    act(() => setBannerRef({ tone: 'danger', title: 'Failed', detail: 'Try again' }))
    expect(screen.getByRole('alert').textContent).toContain('Failed')
    expect(screen.getByText('Try again')).toBeTruthy()
  })

  it('uses role status for a caution banner', () => {
    ui()
    act(() => setBannerRef({ tone: 'caution', title: 'Heads up' }))
    expect(screen.getByRole('status').textContent).toContain('Heads up')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('clears the banner when Dismiss is clicked', async () => {
    ui()
    act(() => setBannerRef({ tone: 'danger', title: 'Failed' }))
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('turns a plain success into a toast without a banner', () => {
    ui()
    act(() => setBannerRef({ tone: 'success', title: 'Removed 1.' }))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('shows one banner at a time', () => {
    ui()
    act(() => setBannerRef({ tone: 'caution', title: 'First' }))
    act(() => setBannerRef({ tone: 'danger', title: 'Second' }))
    expect(screen.queryByText('First')).toBeNull()
    expect(screen.getByText('Second')).toBeInTheDocument()
  })

  it('renders lines under the title and keeps a success with lines as a banner (AC 54)', () => {
    ui()
    act(() =>
      setBannerRef({ tone: 'success', title: 'Added 2.', lines: ['Ann · FPM: Not enrolled'] }),
    )
    expect(screen.getByRole('status').textContent).toContain('Ann · FPM: Not enrolled')
  })

  it('caps lines at 50 and appends and {r} more. (AC 54)', () => {
    ui()
    const lines = Array.from({ length: 53 }, (_, i) => `line-${i}`)
    act(() => setBannerRef({ tone: 'caution', title: 'Skipped', lines }))
    expect(screen.getByText('line-49')).toBeInTheDocument()
    expect(screen.queryByText('line-50')).toBeNull()
    expect(screen.getByText('and 3 more.')).toBeInTheDocument()
  })

  it('renders duplicate lines without key warnings and shows both (AC 54)', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    ui()
    act(() => setBannerRef({ tone: 'caution', title: 'Skipped', lines: ['same', 'same'] }))
    expect(screen.getAllByText('same')).toHaveLength(2)
    expect(err).not.toHaveBeenCalled()
    err.mockRestore()
  })

  it('renders no list for empty lines (AC 54)', () => {
    ui()
    act(() => setBannerRef({ tone: 'caution', title: 'Skipped', lines: [] }))
    expect(screen.queryByRole('list')).toBeNull()
  })
})
