import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockSelect } = vi.hoisted(() => ({ mockSelect: vi.fn() }))
vi.mock('../actions/select-course', () => ({ selectDashboardCourse: mockSelect }))

import { DashboardCourseChips } from './dashboard-course-chips'

const PPL = { id: 'c1', code: 'PPL_A', short: 'PPL', name: 'PPL(A)' }
const RT = { id: 'c2', code: 'VFR_RT', short: 'RT', name: 'VFR RT' }

beforeEach(() => {
  vi.resetAllMocks()
  mockSelect.mockResolvedValue({ success: true })
})

describe('DashboardCourseChips', () => {
  it('renders a pill per course with the selected one pressed', () => {
    render(<DashboardCourseChips courses={[PPL, RT]} selectedCode="PPL_A" />)
    expect(screen.getByRole('group', { name: 'Course' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'PPL' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'RT' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('renders nothing with one course', () => {
    const { container } = render(<DashboardCourseChips courses={[PPL]} selectedCode="PPL_A" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing with no courses', () => {
    const { container } = render(<DashboardCourseChips courses={[]} selectedCode={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('calls selectDashboardCourse with the course code and presses the new pill', async () => {
    render(<DashboardCourseChips courses={[PPL, RT]} selectedCode="PPL_A" />)
    await userEvent.click(screen.getByRole('button', { name: 'RT' }))
    expect(mockSelect).toHaveBeenCalledWith({ code: 'VFR_RT' })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'RT' })).toHaveAttribute('aria-pressed', 'true'),
    )
  })
})
