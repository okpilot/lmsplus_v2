import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ getIssuePreview: vi.fn() }))
vi.mock('../people-queries', () => ({ getIssuePreview: m.getIssuePreview }))
vi.mock('../actions/issue-sitting-codes', () => ({ issueSittingCodes: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/x',
  useSearchParams: () => new URLSearchParams('dlg=issue'),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { SittingUiProvider } from '../_hooks/sitting-ui-context'
import type { Selection } from '../types'
import { DialogShell } from './dialog-shell'
import { IssueCodesContent } from './issue-codes-content'

const PREVIEW = { counts: { issue: 2 }, studentsToIssue: 1, details: [] }

async function body(selection: Selection) {
  const el = await IssueCodesContent({
    sittingId: 's1',
    scheduledAt: '2026-11-18T09:30:00Z',
    selection,
  })
  render(
    <SittingUiProvider>
      <DialogShell>{el}</DialogShell>
    </SittingUiProvider>,
  )
}

describe('IssueCodesContent', () => {
  it('whole sitting: preview for everyone, expiry line (AC 42)', async () => {
    m.getIssuePreview.mockResolvedValue(PREVIEW)
    await body({ kind: 'whole' })
    expect(m.getIssuePreview).toHaveBeenCalledWith('s1', undefined)
    expect(screen.getByRole('heading', { name: 'Issue codes' })).toBeInTheDocument()
    expect(screen.getByText(/Everyone in this sitting\./)).toBeInTheDocument()
    expect(screen.getByText(/Codes work until 18 Nov 2026, 23:59 UTC\./)).toBeInTheDocument()
    expect(screen.getByText('Will issue 2 codes for 1 student.')).toBeInTheDocument()
  })

  it('all-mode asks for everyone too', async () => {
    m.getIssuePreview.mockResolvedValue(PREVIEW)
    await body({ kind: 'all' })
    expect(m.getIssuePreview).toHaveBeenCalledWith('s1', undefined)
  })

  it('explicit ids: preview for those people only', async () => {
    m.getIssuePreview.mockResolvedValue(PREVIEW)
    await body({ kind: 'ids', ids: ['u1', 'u2'], truncated: true })
    expect(m.getIssuePreview).toHaveBeenCalledWith('s1', ['u1', 'u2'])
    expect(screen.getByText(/2 people selected\./)).toBeInTheDocument()
    expect(screen.getByText(/Only the first 100 people were used\./)).toBeInTheDocument()
  })

  it('ids present but none valid: message + Close, never the whole sitting (AC 35)', async () => {
    m.getIssuePreview.mockClear()
    await body({ kind: 'empty' })
    expect(screen.getByText('No valid people to issue codes for.')).toBeInTheDocument()
    expect(m.getIssuePreview).not.toHaveBeenCalled()
  })

  it('ended sitting: message and Close only (AC 60)', async () => {
    m.getIssuePreview.mockResolvedValue({ ended: true })
    await body({ kind: 'whole' })
    expect(screen.getByText('This sitting has ended.')).toBeInTheDocument()
    expect(screen.queryByText('Nothing to issue.')).toBeNull()
  })
})
