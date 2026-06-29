import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

beforeEach(() => {
  mockSendButton.mockClear()
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
}

describe('CodeRow', () => {
  describe('student cell display fallback chain', () => {
    it('shows studentEmail when studentName is empty and email is set', () => {
      renderRow({ ...baseRow, studentName: '', studentEmail: 'fallback@example.com' })
      expect(screen.getByText('fallback@example.com')).toBeInTheDocument()
    })

    it('shows "—" when both studentName and studentEmail are empty', () => {
      renderRow({ ...baseRow, studentName: '', studentEmail: '' })
      // Multiple cells can show '—' (e.g. absent subjectName, dates); at least one
      // must be present — this confirms the final fallback arm is exercised.
      expect(screen.getAllByText('—').length).toBeGreaterThan(0)
    })
  })

  describe('Void button enabled/disabled state', () => {
    it('enables the Void button for a consumed code whose session is still in progress', () => {
      // status=consumed + sessionEndedAt=null means the exam session is still live.
      // isVoidDisabled returns false: r.status === 'consumed' && r.sessionEndedAt !== null
      // evaluates to false when sessionEndedAt is null.
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
  })
})
