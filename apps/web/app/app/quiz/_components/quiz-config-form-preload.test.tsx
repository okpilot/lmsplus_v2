import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockUseQuizConfig, mockPanel } = vi.hoisted(() => ({
  mockUseQuizConfig: vi.fn(),
  mockPanel: vi.fn(),
}))

vi.mock('../_hooks/use-quiz-config', () => ({
  useQuizConfig: (...args: unknown[]) => mockUseQuizConfig(...args),
}))
vi.mock('../_hooks/use-exam-start', () => ({ useExamStart: () => ({}) }))
vi.mock('./discovery-mode-panel', () => ({
  DiscoveryModePanel: (props: unknown) => {
    mockPanel(props)
    return null
  },
}))

// ---- Subject under test ---------------------------------------------------

import { QuizConfigForm } from './quiz-config-form'

const SUBJECTS = [{ id: 's1', code: '010', name: 'Air Law', short: 'AL', questionCount: 5 }]
const PRELOAD = { topicsBySubject: {}, discoveryCounts: {} }

describe('QuizConfigForm — preloaded setup data', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockUseQuizConfig.mockReturnValue({ mode: 'discovery', setMode: vi.fn() })
  })

  it('hands the server-preloaded setup data to the quiz config', () => {
    render(<QuizConfigForm userId="u1" subjects={SUBJECTS} examSubjects={[]} preload={PRELOAD} />)

    expect(mockUseQuizConfig).toHaveBeenCalledWith({ subjects: SUBJECTS, preload: PRELOAD })
  })

  it('hands the server-preloaded setup data to the Discovery panel', () => {
    render(<QuizConfigForm userId="u1" subjects={SUBJECTS} examSubjects={[]} preload={PRELOAD} />)

    expect(mockPanel).toHaveBeenCalledWith(expect.objectContaining({ preload: PRELOAD }))
  })
})
