import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SubjectWithConfig } from '../types'
import { SubjectConfigCard } from './subject-config-card'

// ---- Mocks -----------------------------------------------------------------

vi.mock('../actions/toggle-exam-config', () => ({
  toggleExamConfig: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

import { toast } from 'sonner'
import { toggleExamConfig } from '../actions/toggle-exam-config'

// ---- Fixtures --------------------------------------------------------------

const baseSubject: SubjectWithConfig = {
  id: 'subj-1',
  code: 'AGK',
  name: 'General Knowledge',
  short: 'GK',
  config: null,
  topics: [],
}

const subjectWithConfig: SubjectWithConfig = {
  ...baseSubject,
  config: {
    id: 'cfg-1',
    subjectId: 'subj-1',
    enabled: true,
    totalQuestions: 50,
    timeLimitSeconds: 3600,
    passMark: 75,
    distributions: [],
  },
}

const subjectWithDisabledConfig: SubjectWithConfig = {
  ...baseSubject,
  config: {
    ...subjectWithConfig.config!,
    enabled: false,
  },
}

// ---- Tests -----------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

describe('SubjectConfigCard', () => {
  describe('rendering', () => {
    it('displays the subject code', () => {
      render(<SubjectConfigCard subject={baseSubject} onEdit={vi.fn()} />)
      expect(screen.getByText('AGK')).toBeTruthy()
    })

    it('displays the subject name', () => {
      render(<SubjectConfigCard subject={baseSubject} onEdit={vi.fn()} />)
      expect(screen.getByText('General Knowledge')).toBeTruthy()
    })

    it('shows "Not configured" when config is null', () => {
      render(<SubjectConfigCard subject={baseSubject} onEdit={vi.fn()} />)
      expect(screen.getByText('Not configured')).toBeTruthy()
    })

    it('shows question count when config exists', () => {
      render(<SubjectConfigCard subject={subjectWithConfig} onEdit={vi.fn()} />)
      expect(screen.getByText(/50 Q/)).toBeTruthy()
    })

    it('shows time limit in minutes when config exists', () => {
      render(<SubjectConfigCard subject={subjectWithConfig} onEdit={vi.fn()} />)
      // 3600 seconds = 60 min
      expect(screen.getByText(/60 min/)).toBeTruthy()
    })

    it('shows pass mark when config exists', () => {
      render(<SubjectConfigCard subject={subjectWithConfig} onEdit={vi.fn()} />)
      expect(screen.getByText(/75%/)).toBeTruthy()
    })

    it('shows "Enabled" toggle button when config is enabled', () => {
      render(<SubjectConfigCard subject={subjectWithConfig} onEdit={vi.fn()} />)
      expect(screen.getByRole('button', { name: 'Enabled' })).toBeTruthy()
    })

    it('shows "Disabled" toggle button when config exists but is disabled', () => {
      render(<SubjectConfigCard subject={subjectWithDisabledConfig} onEdit={vi.fn()} />)
      expect(screen.getByRole('button', { name: 'Disabled' })).toBeTruthy()
    })
  })

  describe('card click behaviour', () => {
    it('calls onEdit when the card is clicked', async () => {
      const onEdit = vi.fn()
      render(<SubjectConfigCard subject={baseSubject} onEdit={onEdit} />)
      // The outer button is the card itself — clicking any non-toggle part triggers onEdit
      await userEvent.click(screen.getByText('General Knowledge'))
      expect(onEdit).toHaveBeenCalledTimes(1)
    })

    it('calls onEdit when card without config is clicked', async () => {
      const onEdit = vi.fn()
      render(<SubjectConfigCard subject={baseSubject} onEdit={onEdit} />)
      await userEvent.click(screen.getByText('Not configured'))
      expect(onEdit).toHaveBeenCalledTimes(1)
    })
  })

  describe('toggle button — no config path', () => {
    it('opens edit flow when clicking an unconfigured subject card', async () => {
      const onEdit = vi.fn()
      // With no config, there is no toggle button — clicking the card invokes onEdit
      render(<SubjectConfigCard subject={baseSubject} onEdit={onEdit} />)
      await userEvent.click(screen.getByText('Not configured'))
      expect(onEdit).toHaveBeenCalledTimes(1)
      expect(toggleExamConfig).not.toHaveBeenCalled()
    })
  })

  describe('toggle button — with config', () => {
    it('toggles exam mode when clicking the status button', async () => {
      const onEdit = vi.fn()
      vi.mocked(toggleExamConfig).mockResolvedValue({ success: true })

      render(<SubjectConfigCard subject={subjectWithConfig} onEdit={onEdit} />)
      await userEvent.click(screen.getByRole('button', { name: 'Enabled' }))

      await waitFor(() => {
        expect(toggleExamConfig).toHaveBeenCalledWith({
          subjectId: 'subj-1',
          enabled: false,
        })
      })
      // onEdit must NOT have been called — stopPropagation prevents card click
      expect(onEdit).not.toHaveBeenCalled()
    })

    it('shows toast.success with "Exam mode disabled" when disabling a currently-enabled config', async () => {
      vi.mocked(toggleExamConfig).mockResolvedValue({ success: true })

      render(<SubjectConfigCard subject={subjectWithConfig} onEdit={vi.fn()} />)
      await userEvent.click(screen.getByRole('button', { name: 'Enabled' }))

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith('Exam mode disabled')
      })
    })

    it('shows toast.success with "Exam mode enabled" when enabling a currently-disabled config', async () => {
      vi.mocked(toggleExamConfig).mockResolvedValue({ success: true })

      render(<SubjectConfigCard subject={subjectWithDisabledConfig} onEdit={vi.fn()} />)
      await userEvent.click(screen.getByRole('button', { name: 'Disabled' }))

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith('Exam mode enabled')
      })
    })

    it('shows toast.error with the error message when toggleExamConfig fails', async () => {
      vi.mocked(toggleExamConfig).mockResolvedValue({
        success: false,
        error: 'Config not found',
      })

      render(<SubjectConfigCard subject={subjectWithConfig} onEdit={vi.fn()} />)
      await userEvent.click(screen.getByRole('button', { name: 'Enabled' }))

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Config not found')
      })
      expect(toast.success).not.toHaveBeenCalled()
    })

    it('does not call toast.success when toggleExamConfig returns failure', async () => {
      vi.mocked(toggleExamConfig).mockResolvedValue({
        success: false,
        error: 'Distribution total (40) does not match total questions (50)',
      })

      render(<SubjectConfigCard subject={subjectWithConfig} onEdit={vi.fn()} />)
      await userEvent.click(screen.getByRole('button', { name: 'Enabled' }))

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled()
      })
      expect(toast.success).not.toHaveBeenCalled()
    })
  })
})
