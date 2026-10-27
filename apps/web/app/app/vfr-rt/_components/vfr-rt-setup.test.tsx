import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getRtSubjectData = vi.hoisted(() => vi.fn())
vi.mock('../actions/get-rt-subject', () => ({ getRtSubjectData }))
vi.mock('./vfr-rt-config-form', () => ({
  VfrRtConfigForm: () => <div data-testid="config-form" />,
}))

import { VfrRtSetup } from './vfr-rt-setup'

describe('VfrRtSetup', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('shows the not-enrolled empty state when the RT subject is hidden', async () => {
    getRtSubjectData.mockResolvedValue(null)
    render(await VfrRtSetup())
    expect(screen.getByText('You are not enrolled in this course.')).toBeTruthy()
    expect(screen.queryByTestId('config-form')).toBeNull()
  })

  it('renders the config form when the student is enrolled', async () => {
    getRtSubjectData.mockResolvedValue({
      id: 's1',
      subjects: [],
      topics: [],
      exam: { available: false, questionCount: null },
    })
    render(await VfrRtSetup())
    expect(screen.getByTestId('config-form')).toBeTruthy()
  })
})
