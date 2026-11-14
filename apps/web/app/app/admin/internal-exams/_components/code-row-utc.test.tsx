import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { InternalExamCodeRow } from '../types'

vi.mock('./send-code-email-button', () => ({ SendCodeEmailButton: () => null }))

import { CodeRow } from './code-row'

const originalTz = process.env.TZ
afterEach(() => {
  if (originalTz === undefined) delete process.env.TZ
  else process.env.TZ = originalTz
})

const row: InternalExamCodeRow = {
  id: 'code-1',
  code: 'ABCD-1234-X',
  subjectId: 'subj-1',
  subjectName: 'Air Law',
  studentId: 'stu-1',
  studentName: 'Alice',
  studentEmail: 'alice@example.com',
  issuedBy: 'admin-1',
  issuedAt: '2026-03-15T23:30:00Z',
  expiresAt: '2026-03-15T23:45:00Z',
  consumedAt: null,
  consumedSessionId: null,
  voidedAt: null,
  voidedBy: null,
  voidReason: null,
  emailedAt: null,
  status: 'active',
  sessionEndedAt: null,
}

describe('CodeRow dates', () => {
  it('renders Issued and Expires in UTC (day 15) under Pacific/Kiritimati', () => {
    process.env.TZ = 'Pacific/Kiritimati'
    const { container } = render(
      <table>
        <tbody>
          <CodeRow r={row} onVoid={vi.fn()} />
        </tbody>
      </table>,
    )
    const text = container.textContent ?? ''
    expect(text).toContain('15/03/2026, 23:30 UTC')
    expect(text).toContain('15/03/2026, 23:45 UTC')
  })
})
