'use client'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SubjectWithConfig } from '../types'
import { ConfigFormDialog } from './config-form-dialog'

// ---- Mocks -----------------------------------------------------------------

vi.mock('../actions/upsert-exam-config', () => ({
  upsertExamConfig: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

import { toast } from 'sonner'
import { upsertExamConfig } from '../actions/upsert-exam-config'

// ---- Fixtures --------------------------------------------------------------

const TOPIC_1 = {
  id: 'top-1',
  code: '010',
  name: 'Air Law',
  availableQuestions: 50,
  subtopics: [],
}

const TOPIC_2 = {
  id: 'top-2',
  code: '021',
  name: 'Airframe',
  availableQuestions: 30,
  subtopics: [],
}

const subjectNoConfig: SubjectWithConfig = {
  id: 'subj-1',
  code: 'AGK',
  name: 'General Knowledge',
  short: 'GK',
  config: null,
  topics: [TOPIC_1, TOPIC_2],
}

const subjectWithConfig: SubjectWithConfig = {
  ...subjectNoConfig,
  config: {
    id: 'cfg-1',
    subjectId: 'subj-1',
    enabled: true,
    totalQuestions: 20,
    timeLimitSeconds: 1800,
    passMark: 75,
    distributions: [
      {
        id: 'dist-1',
        topicId: 'top-1',
        topicCode: '010',
        topicName: 'Air Law',
        subtopicId: null,
        subtopicCode: null,
        subtopicName: null,
        questionCount: 15,
        availableQuestions: 50,
      },
      {
        id: 'dist-2',
        topicId: 'top-2',
        topicCode: '021',
        topicName: 'Airframe',
        subtopicId: null,
        subtopicCode: null,
        subtopicName: null,
        questionCount: 5,
        availableQuestions: 30,
      },
    ],
  },
}

// ---- Tests -----------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

describe('ConfigFormDialog', () => {
  describe('rendering when open', () => {
    it('renders the dialog title with subject code and name', () => {
      render(<ConfigFormDialog subject={subjectNoConfig} open={true} onOpenChange={vi.fn()} />)
      expect(screen.getByText(/AGK.*General Knowledge/)).toBeTruthy()
    })

    it('shows default totalQuestions of 16 when no config exists', () => {
      render(<ConfigFormDialog subject={subjectNoConfig} open={true} onOpenChange={vi.fn()} />)
      const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[]
      const totalInput = inputs[0]!
      expect(totalInput.value).toBe('16')
    })

    it('shows default time limit of 30 min when no config exists', () => {
      render(<ConfigFormDialog subject={subjectNoConfig} open={true} onOpenChange={vi.fn()} />)
      const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[]
      const timeInput = inputs[1]!
      expect(timeInput.value).toBe('30')
    })

    it('shows default pass mark of 75 when no config exists', () => {
      render(<ConfigFormDialog subject={subjectNoConfig} open={true} onOpenChange={vi.fn()} />)
      const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[]
      const passInput = inputs[2]!
      expect(passInput.value).toBe('75')
    })

    it('pre-fills totalQuestions from existing config', () => {
      render(<ConfigFormDialog subject={subjectWithConfig} open={true} onOpenChange={vi.fn()} />)
      const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[]
      expect(inputs[0]!.value).toBe('20')
    })

    it('pre-fills time limit in minutes from existing config', () => {
      render(<ConfigFormDialog subject={subjectWithConfig} open={true} onOpenChange={vi.fn()} />)
      const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[]
      // 1800 seconds / 60 = 30 min
      expect(inputs[1]!.value).toBe('30')
    })

    it('pre-fills pass mark from existing config', () => {
      render(<ConfigFormDialog subject={subjectWithConfig} open={true} onOpenChange={vi.fn()} />)
      const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[]
      expect(inputs[2]!.value).toBe('75')
    })

    it('does not render dialog content when open is false', () => {
      render(<ConfigFormDialog subject={subjectNoConfig} open={false} onOpenChange={vi.fn()} />)
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })

  describe('isValid — Save button disabled state', () => {
    it('disables Save Config when distribution sum does not equal totalQuestions', () => {
      // subjectNoConfig has no config → distributions default to 0 per topic,
      // which does not equal default totalQuestions (16) → invalid
      render(<ConfigFormDialog subject={subjectNoConfig} open={true} onOpenChange={vi.fn()} />)
      const saveButton = screen.getByRole('button', { name: 'Save Config' })
      expect((saveButton as HTMLButtonElement).disabled).toBe(true)
    })

    it('enables Save Config when distribution sum equals totalQuestions', () => {
      // subjectWithConfig: distributions sum = 15 + 5 = 20 = totalQuestions → valid
      render(<ConfigFormDialog subject={subjectWithConfig} open={true} onOpenChange={vi.fn()} />)
      const saveButton = screen.getByRole('button', { name: 'Save Config' })
      expect((saveButton as HTMLButtonElement).disabled).toBe(false)
    })

    it('shows distribution total and totalQuestions in the summary line', () => {
      render(<ConfigFormDialog subject={subjectWithConfig} open={true} onOpenChange={vi.fn()} />)
      // 20 / 20 = valid
      expect(screen.getByText(/Total: 20 \/ 20/)).toBeTruthy()
    })

    it('shows mismatch message when distribution sum does not match', () => {
      render(<ConfigFormDialog subject={subjectNoConfig} open={true} onOpenChange={vi.fn()} />)
      expect(screen.getByText(/must match total questions/)).toBeTruthy()
    })

    it('becomes invalid when totalQuestions is changed to mismatch the distribution sum', async () => {
      render(<ConfigFormDialog subject={subjectWithConfig} open={true} onOpenChange={vi.fn()} />)
      // Change totalQuestions from 20 to 25 — distribution sum stays 20 → mismatch
      const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[]
      fireEvent.change(inputs[0]!, { target: { value: '25' } })

      const saveButton = screen.getByRole('button', { name: 'Save Config' })
      expect((saveButton as HTMLButtonElement).disabled).toBe(true)
    })
  })

  describe('handleSubmit — happy path', () => {
    it('calls upsertExamConfig with correct arguments on submit', async () => {
      vi.mocked(upsertExamConfig).mockResolvedValue({ success: true })

      render(<ConfigFormDialog subject={subjectWithConfig} open={true} onOpenChange={vi.fn()} />)
      await userEvent.click(screen.getByRole('button', { name: 'Save Config' }))

      await waitFor(() => {
        expect(upsertExamConfig).toHaveBeenCalledWith({
          subjectId: 'subj-1',
          enabled: true,
          totalQuestions: 20,
          timeLimitSeconds: 1800,
          passMark: 75,
          distributions: [
            { topicId: 'top-1', subtopicId: null, questionCount: 15 },
            { topicId: 'top-2', subtopicId: null, questionCount: 5 },
          ],
        })
      })
    })

    it('shows toast.success and closes dialog when upsertExamConfig succeeds', async () => {
      const onOpenChange = vi.fn()
      vi.mocked(upsertExamConfig).mockResolvedValue({ success: true })

      render(
        <ConfigFormDialog subject={subjectWithConfig} open={true} onOpenChange={onOpenChange} />,
      )
      await userEvent.click(screen.getByRole('button', { name: 'Save Config' }))

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith('Exam configuration saved')
      })
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })

    it('filters out distributions with questionCount of 0 before submitting', async () => {
      vi.mocked(upsertExamConfig).mockResolvedValue({ success: true })

      // Build a subject with config where one topic has 0 questions
      const subjectZeroDist: SubjectWithConfig = {
        ...subjectWithConfig,
        config: {
          ...subjectWithConfig.config!,
          totalQuestions: 15,
          distributions: [
            {
              id: 'dist-1',
              topicId: 'top-1',
              topicCode: '010',
              topicName: 'Air Law',
              subtopicId: null,
              subtopicCode: null,
              subtopicName: null,
              questionCount: 15,
              availableQuestions: 50,
            },
            {
              id: 'dist-2',
              topicId: 'top-2',
              topicCode: '021',
              topicName: 'Airframe',
              subtopicId: null,
              subtopicCode: null,
              subtopicName: null,
              questionCount: 0,
              availableQuestions: 30,
            },
          ],
        },
      }

      render(<ConfigFormDialog subject={subjectZeroDist} open={true} onOpenChange={vi.fn()} />)
      await userEvent.click(screen.getByRole('button', { name: 'Save Config' }))

      await waitFor(() => {
        expect(upsertExamConfig).toHaveBeenCalled()
      })
      const callArgs = vi.mocked(upsertExamConfig).mock.calls[0]![0] as {
        distributions: { questionCount: number }[]
      }
      expect(callArgs.distributions).toHaveLength(1)
      expect(callArgs.distributions[0]!.questionCount).toBe(15)
    })
  })

  describe('handleSubmit — error path', () => {
    it('shows toast.error and does not close dialog when upsertExamConfig fails', async () => {
      const onOpenChange = vi.fn()
      vi.mocked(upsertExamConfig).mockResolvedValue({
        success: false,
        error: 'Failed to save exam configuration',
      })

      render(
        <ConfigFormDialog subject={subjectWithConfig} open={true} onOpenChange={onOpenChange} />,
      )
      await userEvent.click(screen.getByRole('button', { name: 'Save Config' }))

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to save exam configuration')
      })
      expect(onOpenChange).not.toHaveBeenCalledWith(false)
      expect(toast.success).not.toHaveBeenCalled()
    })

    it('shows toast.error with fallback message and does not close dialog when upsertExamConfig throws', async () => {
      const onOpenChange = vi.fn()
      vi.mocked(upsertExamConfig).mockRejectedValue(new Error('Network failure'))

      render(
        <ConfigFormDialog subject={subjectWithConfig} open={true} onOpenChange={onOpenChange} />,
      )
      await userEvent.click(screen.getByRole('button', { name: 'Save Config' }))

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to save exam configuration')
      })
      expect(onOpenChange).not.toHaveBeenCalledWith(false)
      expect(toast.success).not.toHaveBeenCalled()
    })
  })

  describe('Cancel button', () => {
    it('calls onOpenChange(false) when Cancel is clicked', async () => {
      const onOpenChange = vi.fn()
      render(<ConfigFormDialog subject={subjectNoConfig} open={true} onOpenChange={onOpenChange} />)
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
  })

  describe('time limit conversion', () => {
    it('converts timeLimitSeconds to minutes for display', () => {
      const subject: SubjectWithConfig = {
        ...subjectWithConfig,
        config: {
          ...subjectWithConfig.config!,
          timeLimitSeconds: 3600,
        },
      }
      render(<ConfigFormDialog subject={subject} open={true} onOpenChange={vi.fn()} />)
      const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[]
      expect(inputs[1]!.value).toBe('60')
    })

    it('submits timeLimitSeconds converted back from minutes', async () => {
      vi.mocked(upsertExamConfig).mockResolvedValue({ success: true })

      render(<ConfigFormDialog subject={subjectWithConfig} open={true} onOpenChange={vi.fn()} />)
      // Default timeLimitMinutes = 1800/60 = 30 → timeLimitSeconds submitted = 30*60 = 1800
      await userEvent.click(screen.getByRole('button', { name: 'Save Config' }))

      await waitFor(() => {
        expect(upsertExamConfig).toHaveBeenCalled()
      })
      const callArgs = vi.mocked(upsertExamConfig).mock.calls[0]![0] as {
        timeLimitSeconds: number
      }
      expect(callArgs.timeLimitSeconds).toBe(1800)
    })
  })
})
