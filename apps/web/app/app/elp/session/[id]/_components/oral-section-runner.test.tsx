import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ------------------------------------------------------------------

const { mockUseAudioRecorder, mockUseSectionSubmit, mockSubmit } = vi.hoisted(() => ({
  mockUseAudioRecorder: vi.fn(),
  mockUseSectionSubmit: vi.fn(),
  mockSubmit: vi.fn(),
}))

vi.mock('../../../_hooks/use-audio-recorder', () => ({
  useAudioRecorder: () => mockUseAudioRecorder(),
}))

vi.mock('../_hooks/use-section-submit', () => ({
  useSectionSubmit: (...args: unknown[]) => mockUseSectionSubmit(...args),
}))

// ---- Subject under test -------------------------------------------------------

import { OralSectionRunner } from './oral-section-runner'

// ---- Fixtures -----------------------------------------------------------------

const SESSION = {
  id: 'sess-1',
  status: 'active',
  mode: 'practice',
  sections: [{ sectionNo: 1, type: 'interview' }],
  responses: [],
}

const SECTION = { sectionNo: 1, type: 'interview', isLast: true }

const PROMPT = {
  id: 'interview-1',
  label: '§1 Interview',
  text: 'Tell me about your flight training so far.',
  audioSrc: '/elp/prompts/interview-1.mp3',
}

const PLACEHOLDER_PROMPT = {
  id: 'picture-1',
  label: '§2 Picture Description',
  text: '[practice placeholder] Describe an aviation scene in detail.',
}

function idleRecorder(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    status: 'idle',
    file: null,
    audioUrl: null,
    durationMs: 0,
    error: null,
    start: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  mockUseSectionSubmit.mockReturnValue({ submit: mockSubmit, submitting: false, error: null })
  mockUseAudioRecorder.mockReturnValue(idleRecorder())
})

// ---- Tests ----------------------------------------------------------------------

describe('OralSectionRunner — prompt', () => {
  it('renders the interview prompt text and audio player', () => {
    render(<OralSectionRunner session={SESSION} section={SECTION} prompt={PROMPT} />)
    expect(screen.getByText(PROMPT.text)).toBeInTheDocument()
    expect(screen.getByLabelText('Interview question')).toHaveAttribute('src', PROMPT.audioSrc)
  })

  it('renders the prompt text but no audio player when the prompt has no audio', () => {
    render(<OralSectionRunner session={SESSION} section={SECTION} prompt={PLACEHOLDER_PROMPT} />)
    expect(screen.getByText(PLACEHOLDER_PROMPT.text)).toBeInTheDocument()
    expect(screen.queryByLabelText('Interview question')).not.toBeInTheDocument()
  })

  it('labels the heading with the section label and Practice for a practice-mode session', () => {
    render(<OralSectionRunner session={SESSION} section={SECTION} prompt={PROMPT} />)
    expect(screen.getByRole('heading', { name: '§1 Interview — Practice' })).toBeInTheDocument()
  })

  it('labels the heading with the section label and Mock Exam for a mock-mode session', () => {
    render(
      <OralSectionRunner
        session={{ ...SESSION, mode: 'mock' }}
        section={SECTION}
        prompt={PROMPT}
      />,
    )
    expect(screen.getByRole('heading', { name: '§1 Interview — Mock Exam' })).toBeInTheDocument()
  })

  it('shows the section position subheading for a mock-mode session', () => {
    const mockSession = {
      ...SESSION,
      mode: 'mock',
      sections: [
        { sectionNo: 1, type: 'interview' },
        { sectionNo: 2, type: 'picture' },
        { sectionNo: 3, type: 'comms' },
        { sectionNo: 4, type: 'listening' },
        { sectionNo: 5, type: 'video' },
      ],
    }
    const section = { sectionNo: 2, type: 'picture', isLast: false }
    render(
      <OralSectionRunner session={mockSession} section={section} prompt={PLACEHOLDER_PROMPT} />,
    )
    expect(screen.getByText('Section 2 of 5')).toBeInTheDocument()
  })

  it('does not show the section position subheading for a practice-mode session', () => {
    render(<OralSectionRunner session={SESSION} section={SECTION} prompt={PROMPT} />)
    expect(screen.queryByText(/Section \d+ of \d+/)).not.toBeInTheDocument()
  })
})

describe('OralSectionRunner — recorder states', () => {
  it('shows the Record button and a disabled Submit button when idle with no file', () => {
    render(<OralSectionRunner session={SESSION} section={SECTION} prompt={PROMPT} />)
    expect(screen.getByRole('button', { name: /record your answer/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /submit answer/i })).toBeDisabled()
  })

  it('shows the Stop Recording button while recording', () => {
    mockUseAudioRecorder.mockReturnValue(idleRecorder({ status: 'recording' }))
    render(<OralSectionRunner session={SESSION} section={SECTION} prompt={PROMPT} />)
    expect(screen.getByRole('button', { name: /stop recording/i })).toBeInTheDocument()
  })

  it('shows a denied message and keeps Submit disabled when the microphone was denied', () => {
    mockUseAudioRecorder.mockReturnValue(
      idleRecorder({ status: 'denied', error: 'Microphone access was denied.' }),
    )
    render(<OralSectionRunner session={SESSION} section={SECTION} prompt={PROMPT} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Microphone access was denied.')
    expect(screen.getByRole('button', { name: /submit answer/i })).toBeDisabled()
  })

  it('shows an unsupported message when recording is not supported', () => {
    mockUseAudioRecorder.mockReturnValue(idleRecorder({ status: 'unsupported' }))
    render(<OralSectionRunner session={SESSION} section={SECTION} prompt={PROMPT} />)
    expect(screen.getByRole('alert')).toHaveTextContent(/not supported/i)
  })
})

describe('OralSectionRunner — submitting a recorded answer', () => {
  const file = new File([new Uint8Array(10)], 'answer.webm', { type: 'audio/webm' })

  it('enables Submit once a recording exists and submits the recorded file and duration', async () => {
    mockUseAudioRecorder.mockReturnValue(
      idleRecorder({ status: 'recorded', file, audioUrl: 'blob:mock', durationMs: 5000 }),
    )
    render(<OralSectionRunner session={SESSION} section={SECTION} prompt={PROMPT} />)

    const submitButton = screen.getByRole('button', { name: /submit answer/i })
    expect(submitButton).not.toBeDisabled()

    await userEvent.click(submitButton)
    expect(mockSubmit).toHaveBeenCalledWith(file, 5000)
  })

  it('shows a Re-record button after a recording is made', () => {
    mockUseAudioRecorder.mockReturnValue(
      idleRecorder({ status: 'recorded', file, audioUrl: 'blob:mock', durationMs: 5000 }),
    )
    render(<OralSectionRunner session={SESSION} section={SECTION} prompt={PROMPT} />)
    expect(screen.getByRole('button', { name: /re-record/i })).toBeInTheDocument()
  })

  it('shows the submit error when the submit hook reports a failure', () => {
    mockUseSectionSubmit.mockReturnValue({
      submit: mockSubmit,
      submitting: false,
      error: 'This section was already submitted.',
    })
    mockUseAudioRecorder.mockReturnValue(
      idleRecorder({ status: 'recorded', file, audioUrl: 'blob:mock', durationMs: 5000 }),
    )
    render(<OralSectionRunner session={SESSION} section={SECTION} prompt={PROMPT} />)
    expect(screen.getByRole('alert')).toHaveTextContent('This section was already submitted.')
  })

  it('disables Submit while a submission is in flight', () => {
    mockUseSectionSubmit.mockReturnValue({ submit: mockSubmit, submitting: true, error: null })
    mockUseAudioRecorder.mockReturnValue(
      idleRecorder({ status: 'recorded', file, audioUrl: 'blob:mock', durationMs: 5000 }),
    )
    render(<OralSectionRunner session={SESSION} section={SECTION} prompt={PROMPT} />)
    expect(screen.getByRole('button', { name: /submitting/i })).toBeDisabled()
  })

  it('wires the submit handler to the session id and the current section', () => {
    render(<OralSectionRunner session={SESSION} section={SECTION} prompt={PROMPT} />)
    expect(mockUseSectionSubmit).toHaveBeenCalledWith({
      sessionId: SESSION.id,
      sectionNo: 1,
      isLast: true,
    })
  })
})
