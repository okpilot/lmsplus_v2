import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { DashboardStudent } from '../types'
import { StudentRow } from './student-table-helpers'

function student(): DashboardStudent {
  return {
    id: 's1',
    fullName: 'Alice',
    email: 'a@example.com',
    lastActiveAt: new Date().toISOString(),
    sessionCount: 1,
    avgScore: 50,
    isActive: true,
    hasRecentActivity: true,
  } as unknown as DashboardStudent
}

function setup() {
  return render(
    <table>
      <tbody>
        <StudentRow student={student()} onClick={vi.fn()} />
      </tbody>
    </table>,
  )
}

describe('StudentRow activity dot tooltip', () => {
  it('exposes the dot as an img named "Active in last 7 days" with bg-success, no title', () => {
    setup()
    const dot = screen.getByRole('img', { name: 'Active in last 7 days' })
    expect(dot).toHaveClass('bg-success')
    expect(dot).not.toHaveAttribute('title')
  })

  it('shows the tooltip on hover', async () => {
    setup()
    await userEvent.setup().hover(screen.getByRole('img', { name: 'Active in last 7 days' }))
    const tip = await screen.findByRole('tooltip', {}, { timeout: 1500 })
    expect(tip).toHaveTextContent('Active in last 7 days')
  })

  it('shows no tooltip on touch pointer', async () => {
    setup()
    await userEvent.setup().pointer({
      keys: '[TouchA]',
      target: screen.getByRole('img', { name: 'Active in last 7 days' }),
    })
    await new Promise((r) => setTimeout(r, 800))
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
})
