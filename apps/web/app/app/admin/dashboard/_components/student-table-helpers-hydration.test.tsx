import { act } from '@testing-library/react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DashboardStudent } from '../types'
import { StudentRow } from './student-table-helpers'

const NOW = 1_800_000_000_000

const STUDENT: DashboardStudent = {
  id: 'stu-1',
  fullName: 'Alice Martin',
  email: 'alice@example.com',
  lastActiveAt: new Date(NOW - 30_000).toISOString(),
  sessionCount: 1,
  avgScore: 50,
  mastery: 50,
  isActive: true,
  hasRecentActivity: false,
}

function Tree() {
  return (
    <table>
      <tbody>
        <StudentRow student={STUDENT} onClick={() => undefined} />
      </tbody>
    </table>
  )
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('StudentRow hydration', () => {
  it('hydrates the Last Active cell without a hydration error when the minute rolls over after server render', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(NOW)
    const html = renderToString(<Tree />)
    expect(html).toContain('0m ago')

    nowSpy.mockReturnValue(NOW + 90_000)
    const container = document.createElement('div')
    container.innerHTML = html
    document.body.appendChild(container)
    const onRecoverableError = vi.fn()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

    await act(async () => {
      hydrateRoot(container, <Tree />, { onRecoverableError })
    })

    expect(onRecoverableError).not.toHaveBeenCalled()
    const hydrationLogs = consoleError.mock.calls.filter((c) => String(c[0]).includes('ydrat'))
    expect(hydrationLogs).toEqual([])
    container.remove()
  })
})
