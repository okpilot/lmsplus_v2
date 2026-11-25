import { render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InternalExamCodeRow } from '../types'

// Stub the leaf button so we don't pull in the 'use server' action chain.
// A spy (not a bare fn) so we can assert the props CodeRow forwards to it.
const mockSendButton = vi.hoisted(() =>
  vi.fn((_props: { codeId: string; emailedAt: string | null; disabled?: boolean }) => null),
)
vi.mock('./send-code-email-button', () => ({
  SendCodeEmailButton: mockSendButton,
}))

import { CodeRow } from './code-row'

const originalTz = process.env.TZ
beforeEach(() => {
  mockSendButton.mockClear()
})
afterEach(() => {
  if (originalTz === undefined) delete process.env.TZ
  else process.env.TZ = originalTz
})

// CodeRow renders a <tr> which requires a table wrapper in jsdom.
function renderRow(r: InternalExamCodeRow) {
  return render(
    <table>
      <tbody>
        <CodeRow r={r} onVoid={vi.fn()} />
      </tbody>
    </table>,
  )
}

const baseRow: InternalExamCodeRow = {
  id: 'code-1',
  code: 'ABCD-1234-X',
  subjectId: 'subj-1',
  subjectName: 'Air Law',
  studentId: 'stu-1',
  studentName: 'Alice',
  studentEmail: 'alice@example.com',
  issuedBy: 'admin-1',
  issuedAt: '2026-04-28T10:00:00.000Z',
  expiresAt: '2026-04-29T10:00:00.000Z',
  consumedAt: null,
  consumedSessionId: null,
  voidedAt: null,
  voidedBy: null,
  voidReason: null,
  emailedAt: null,
  status: 'active',
  sessionEndedAt: null,
  sessionDeletedAt: null,
  sittingId: null,
  sittingEntryId: null,
}

describe('CodeRow status text', () => {
  it.each([
    ['Voided', { status: 'voided' }, true],
    ['Active', { status: 'active' }, false],
    ['Finished', { status: 'consumed', sessionEndedAt: '2026-10-31T10:00:00Z' }, false],
    ['In progress', { status: 'consumed' }, false],
    ['Expired', { status: 'expired' }, true],
  ] as const)('shows status %s as plain text, muted only when %s', (label, patch, muted) => {
    const { container } = renderRow({ ...baseRow, ...patch })
    expect(container.querySelector('[data-slot="badge"]')).toBeNull()
    const el = screen.getByText(label)
    expect(el.classList.contains('text-muted-foreground')).toBe(muted)
  })
})

describe('CodeRow', () => {
  describe('student cell display fallback chain', () => {
    it('shows studentEmail when studentName is empty and email is set', () => {
      renderRow({ ...baseRow, studentName: '', studentEmail: 'fallback@example.com' })
      expect(screen.getByText('fallback@example.com')).toBeInTheDocument()
    })

    it('shows "—" when both studentName and studentEmail are empty', () => {
      renderRow({ ...baseRow, studentName: '', studentEmail: '' })
      // Scope to the Student column (cell index 2: Status, Code, Student) so the
      // assertion proves THIS fallback arm, not an unrelated dash elsewhere.
      const row = screen.getByRole('row')
      expect(within(row).getAllByRole('cell')[2]).toHaveTextContent('—')
    })
  })

  describe('Void button enabled/disabled state', () => {
    it('enables the Void button for a consumed code whose session is still in progress', () => {
      // sessionEndedAt=null encodes a still-live exam session.
      renderRow({
        ...baseRow,
        status: 'consumed',
        consumedAt: '2026-04-28T11:00:00.000Z',
        consumedSessionId: 'sess-1',
        sessionEndedAt: null,
      })
      expect((screen.getByRole('button', { name: 'Void' }) as HTMLButtonElement).disabled).toBe(
        false,
      )
    })

    it('enables the Void button for an expired code', () => {
      // An expired code has not been voided or consumed; it can still be voided to
      // prevent re-issuance confusion.
      renderRow({ ...baseRow, status: 'expired' })
      expect((screen.getByRole('button', { name: 'Void' }) as HTMLButtonElement).disabled).toBe(
        false,
      )
    })
  })

  describe('send-email button enablement', () => {
    it('leaves the send button enabled for an active code', () => {
      renderRow({ ...baseRow, status: 'active' })
      expect(mockSendButton.mock.calls[0]?.[0]).toMatchObject({ disabled: false })
    })

    it('disables the send button for a non-active (voided) code', () => {
      renderRow({
        ...baseRow,
        status: 'voided',
        voidedAt: '2026-04-28T12:00:00.000Z',
        voidedBy: 'admin-1',
      })
      expect(mockSendButton.mock.calls[0]?.[0]).toMatchObject({ disabled: true })
    })

    it('scopes the send button to the code and sent state of its row', () => {
      renderRow({ ...baseRow, id: 'code-42', emailedAt: '2026-04-28T09:00:00.000Z' })
      expect(mockSendButton.mock.calls[0]?.[0]).toMatchObject({
        codeId: 'code-42',
        emailedAt: '2026-04-28T09:00:00.000Z',
      })
    })
  })

  describe('dates', () => {
    it('renders Issued and Expires in UTC (day 15) under Pacific/Kiritimati', () => {
      process.env.TZ = 'Pacific/Kiritimati'
      const { container } = renderRow({
        ...baseRow,
        issuedAt: '2026-03-15T23:30:00Z',
        expiresAt: '2026-03-15T23:45:00Z',
      })
      const text = container.textContent ?? ''
      expect(text).toContain('15/03/2026, 23:30')
      expect(text).toContain('15/03/2026, 23:45')
      expect(text).not.toContain('UTC')
    })
  })
})

describe('CodeRow sitting codes', () => {
  const sitting = { ...baseRow, sittingId: 'sit-9', sittingEntryId: 'ent-9' }

  it('shows a "Sitting code" link to the sitting page', () => {
    renderRow(sitting)
    expect(screen.getByRole('link', { name: 'Sitting code' })).toHaveAttribute(
      'href',
      '/app/admin/internal-exams/sittings/sit-9',
    )
  })

  it('shows the Sitting code link for a voided (removed-entry) code too', () => {
    renderRow({ ...sitting, status: 'voided', voidedAt: '2026-04-28T12:00:00.000Z' })
    expect(screen.getByRole('link', { name: 'Sitting code' })).toBeInTheDocument()
  })

  it('does not render the email button', () => {
    renderRow(sitting)
    expect(mockSendButton).not.toHaveBeenCalled()
  })

  it('offers Void for a sitting code whose attempt is still running', () => {
    renderRow({ ...sitting, status: 'consumed', consumedAt: '2026-04-28T11:00:00.000Z' })
    expect(screen.getByRole('button', { name: 'Void' })).toBeEnabled()
  })

  it('does not offer Void when the attempt session is soft-deleted', () => {
    // The list reads with the service role and sees the row; the server guard reads through RLS
    // and does not. Offering Void here would give the admin a button that always fails.
    renderRow({
      ...sitting,
      status: 'consumed',
      consumedAt: '2026-04-28T11:00:00.000Z',
      sessionDeletedAt: '2026-04-28T12:00:00.000Z',
    })
    expect(screen.queryByRole('button', { name: 'Void' })).not.toBeInTheDocument()
  })

  it('reads the soft-deleted attempt as Discarded, not as still running', () => {
    // "In progress" plus no Void is a row the admin can neither finish nor stop.
    renderRow({
      ...sitting,
      status: 'consumed',
      consumedAt: '2026-04-28T11:00:00.000Z',
      sessionDeletedAt: '2026-04-28T12:00:00.000Z',
    })
    expect(screen.getByText('Discarded')).toBeInTheDocument()
    expect(screen.queryByText('In progress')).not.toBeInTheDocument()
  })

  it('offers no Void for a legacy code whose attempt was discarded', () => {
    // `void_internal_exam_code` raises `session_state_changed` for it on every click.
    renderRow({
      ...sitting,
      sittingEntryId: null,
      sittingId: null,
      status: 'consumed',
      consumedAt: '2026-04-28T11:00:00.000Z',
      sessionDeletedAt: '2026-04-28T12:00:00.000Z',
    })
    expect(screen.getByText('Discarded')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Void' })).toBeDisabled()
  })

  it('does not offer Void once the attempt has ended', () => {
    renderRow({
      ...sitting,
      status: 'consumed',
      consumedAt: '2026-04-28T11:00:00.000Z',
      sessionEndedAt: '2026-04-28T12:00:00.000Z',
    })
    expect(screen.queryByRole('button', { name: 'Void' })).not.toBeInTheDocument()
  })

  it.each(['active', 'waiting'] as const)(
    'does not render Void for a %s sitting code',
    (status) => {
      renderRow({ ...sitting, status })
      expect(screen.queryByRole('button', { name: 'Void' })).not.toBeInTheDocument()
    },
  )

  it('hides Void, email and link for a sitting code whose embed is null', () => {
    renderRow({ ...sitting, sittingId: null })
    expect(screen.queryByRole('button', { name: 'Void' })).not.toBeInTheDocument()
    expect(mockSendButton).not.toHaveBeenCalled()
    expect(screen.queryByRole('link', { name: 'Sitting code' })).not.toBeInTheDocument()
  })

  it('shows Waiting for start for a waiting sitting code', () => {
    renderRow({ ...sitting, status: 'waiting' })
    expect(screen.getByText('Waiting for start')).toBeInTheDocument()
  })

  it('keeps the email button and Void and no link on a legacy row', () => {
    renderRow(baseRow)
    expect(screen.queryByRole('link', { name: 'Sitting code' })).not.toBeInTheDocument()
    expect(mockSendButton).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Void' })).toBeInTheDocument()
  })
})
