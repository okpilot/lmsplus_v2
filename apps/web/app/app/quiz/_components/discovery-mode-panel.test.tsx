import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QuizMode } from '../types'

const { mockModeToggle, mockStudyConfigForm } = vi.hoisted(() => ({
  mockModeToggle: vi.fn(),
  mockStudyConfigForm: vi.fn(),
}))

vi.mock('./mode-toggle', () => ({
  ModeToggle: ({
    value,
    onValueChange,
  }: {
    value: string
    onValueChange: (m: string) => void
    examAvailable?: boolean
  }) => (
    <div data-testid="mode-toggle" data-value={value}>
      <button type="button" onClick={() => onValueChange('study')}>
        Study
      </button>
      <button type="button" onClick={() => onValueChange('exam')}>
        Exam
      </button>
      {mockModeToggle({ value, onValueChange })}
    </div>
  ),
}))

vi.mock('./study-config-form', () => ({
  StudyConfigForm: ({
    userId,
    unseenLabel,
    subjects,
  }: {
    userId: string
    unseenLabel?: string
    subjects: unknown[]
  }) => {
    mockStudyConfigForm({ userId, unseenLabel, subjects })
    return (
      <div
        data-testid="study-config-form"
        data-unseen-label={unseenLabel ?? ''}
        data-user-id={userId}
      >
        StudyConfigForm
      </div>
    )
  },
}))

import { DiscoveryModePanel } from './discovery-mode-panel'

const SUBJECTS = [
  { id: 'sub-1', code: '050', name: 'Meteorology', short: 'MET', questionCount: 30 },
]
const USER_ID = 'user-1'

describe('DiscoveryModePanel', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockModeToggle.mockReturnValue(null)
    mockStudyConfigForm.mockReturnValue(null)
  })

  it('shows the mode selector and study form together', () => {
    render(
      <DiscoveryModePanel
        mode="discovery"
        onModeChange={vi.fn()}
        examAvailable={false}
        subjects={SUBJECTS}
        userId={USER_ID}
      />,
    )
    expect(screen.getByTestId('mode-toggle')).toBeInTheDocument()
    expect(screen.getByTestId('study-config-form')).toBeInTheDocument()
  })

  it('labels unseen questions as Unseen in the study form', () => {
    render(
      <DiscoveryModePanel
        mode="discovery"
        onModeChange={vi.fn()}
        examAvailable={false}
        subjects={SUBJECTS}
        userId={USER_ID}
      />,
    )
    expect(screen.getByTestId('study-config-form')).toHaveAttribute('data-unseen-label', 'Unseen')
  })

  it('passes the userId through to the study form', () => {
    render(
      <DiscoveryModePanel
        mode="discovery"
        onModeChange={vi.fn()}
        examAvailable={false}
        subjects={SUBJECTS}
        userId={USER_ID}
      />,
    )
    expect(screen.getByTestId('study-config-form')).toHaveAttribute('data-user-id', USER_ID)
    expect(mockStudyConfigForm).toHaveBeenCalledWith(expect.objectContaining({ userId: USER_ID }))
  })

  it('reflects the current mode in the mode selector', () => {
    render(
      <DiscoveryModePanel
        mode={'study' as QuizMode}
        onModeChange={vi.fn()}
        examAvailable={false}
        subjects={SUBJECTS}
        userId={USER_ID}
      />,
    )
    expect(screen.getByTestId('mode-toggle')).toHaveAttribute('data-value', 'study')
  })

  it('notifies the parent when a different mode is selected', async () => {
    const onModeChange = vi.fn()
    const user = userEvent.setup()
    render(
      <DiscoveryModePanel
        mode="discovery"
        onModeChange={onModeChange}
        examAvailable={false}
        subjects={SUBJECTS}
        userId={USER_ID}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Study' }))
    expect(onModeChange).toHaveBeenCalledWith('study')
  })
})
