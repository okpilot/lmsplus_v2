import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockSelect } = vi.hoisted(() => ({ mockSelect: vi.fn() }))
vi.mock('../actions/select-course', () => ({ selectDashboardCourse: mockSelect }))

vi.mock('@/app/app/_components/filter-select', () => ({
  FilterSelect: ({
    value,
    items,
    ariaLabel,
    onValueChange,
  }: {
    value: string
    items: { value: string; label: string }[]
    ariaLabel: string
    onValueChange: (v: string | null) => void
  }) => (
    <select aria-label={ariaLabel} value={value} onChange={(e) => onValueChange(e.target.value)}>
      {items.map((i) => (
        <option key={i.value} value={i.value}>
          {i.label}
        </option>
      ))}
    </select>
  ),
}))

import { DashboardCourseChips } from './dashboard-course-chips'

const PPL = { id: 'c1', code: 'PPL_A', short: 'PPL', name: 'PPL(A)' }
const RT = { id: 'c2', code: 'VFR_RT', short: 'RT', name: 'VFR RT' }

beforeEach(() => {
  vi.resetAllMocks()
  mockSelect.mockResolvedValue({ success: true })
})

describe('DashboardCourseChips', () => {
  it('renders a Course select with an option per course and the selected one chosen', () => {
    render(<DashboardCourseChips courses={[PPL, RT]} selectedCode="PPL_A" />)
    expect(screen.getByRole('combobox', { name: 'Course' })).toHaveValue('PPL_A')
    expect(screen.getByRole('option', { name: 'PPL' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'RT' })).toBeInTheDocument()
  })

  it('renders nothing with one course', () => {
    const { container } = render(<DashboardCourseChips courses={[PPL]} selectedCode="PPL_A" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing with no courses', () => {
    const { container } = render(<DashboardCourseChips courses={[]} selectedCode={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('calls selectDashboardCourse with the course code and selects the new course', async () => {
    render(<DashboardCourseChips courses={[PPL, RT]} selectedCode="PPL_A" />)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Course' }), 'VFR_RT')
    expect(mockSelect).toHaveBeenCalledWith({ code: 'VFR_RT' })
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Course' })).toHaveValue('VFR_RT'),
    )
  })

  it('restores the previous course when the action returns a failure', async () => {
    mockSelect.mockResolvedValue({ success: false, error: 'Not enrolled in this course' })
    render(<DashboardCourseChips courses={[PPL, RT]} selectedCode="PPL_A" />)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Course' }), 'VFR_RT')
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Course' })).toHaveValue('PPL_A'),
    )
  })

  it('restores the previous course and accepts a new switch when the action rejects', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockSelect.mockRejectedValueOnce(new Error('network down'))
    render(<DashboardCourseChips courses={[PPL, RT]} selectedCode="PPL_A" />)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Course' }), 'VFR_RT')
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Course' })).toHaveValue('PPL_A'),
    )
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Course' }), 'VFR_RT')
    expect(mockSelect).toHaveBeenCalledTimes(2)
  })

  it('ignores a second change while the first switch is pending', async () => {
    let resolve: (v: { success: true }) => void = () => undefined
    mockSelect.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r
        }),
    )
    render(<DashboardCourseChips courses={[PPL, RT]} selectedCode="PPL_A" />)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Course' }), 'VFR_RT')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Course' }), 'PPL_A')
    expect(mockSelect).toHaveBeenCalledTimes(1)
    resolve({ success: true })
    await waitFor(async () => {
      await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Course' }), 'PPL_A')
      expect(mockSelect).toHaveBeenCalledTimes(2)
    })
  })
})
