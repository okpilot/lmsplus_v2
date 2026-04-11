import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TopicInfo } from '../types'
import { DistributionEditor } from './distribution-editor'

// ---- Fixtures ---------------------------------------------------------------

const TOPICS: TopicInfo[] = [
  {
    id: 'topic-1',
    code: '010',
    name: 'Air Law',
    availableQuestions: 50,
    subtopics: [],
  },
  {
    id: 'topic-2',
    code: '021',
    name: 'Airframe',
    availableQuestions: 30,
    subtopics: [],
  },
]

type DistRow = { topicId: string; subtopicId: string | null; questionCount: number }

function makeDistributions(overrides: Partial<DistRow>[] = []): DistRow[] {
  return overrides.map((o) => ({
    topicId: '',
    subtopicId: null,
    questionCount: 0,
    ...o,
  }))
}

// ---- Tests ------------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

describe('DistributionEditor', () => {
  describe('rendering', () => {
    it('renders a row for every topic', () => {
      render(<DistributionEditor topics={TOPICS} distributions={[]} onChange={vi.fn()} />)
      expect(screen.getByText('Air Law')).toBeTruthy()
      expect(screen.getByText('Airframe')).toBeTruthy()
    })

    it('displays the topic code alongside the topic name', () => {
      render(<DistributionEditor topics={TOPICS} distributions={[]} onChange={vi.fn()} />)
      expect(screen.getByText('010')).toBeTruthy()
      expect(screen.getByText('021')).toBeTruthy()
    })

    it('shows the correct initial count from distributions', () => {
      const distributions = makeDistributions([
        { topicId: 'topic-1', subtopicId: null, questionCount: 12 },
      ])
      render(
        <DistributionEditor topics={TOPICS} distributions={distributions} onChange={vi.fn()} />,
      )
      const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[]
      expect(inputs[0]!.value).toBe('12')
    })

    it('shows 0 for a topic that has no distribution entry', () => {
      render(<DistributionEditor topics={TOPICS} distributions={[]} onChange={vi.fn()} />)
      const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[]
      for (const input of inputs) {
        expect(input.value).toBe('0')
      }
    })

    it('shows available-question counts for each topic', () => {
      render(<DistributionEditor topics={TOPICS} distributions={[]} onChange={vi.fn()} />)
      expect(screen.getByText('50')).toBeTruthy()
      expect(screen.getByText('30')).toBeTruthy()
    })
  })

  describe('updateCount — updating an existing row', () => {
    it('calls onChange with the updated count when the user changes a topic input', () => {
      const onChange = vi.fn()
      const distributions = makeDistributions([
        { topicId: 'topic-1', subtopicId: null, questionCount: 5 },
      ])
      render(
        <DistributionEditor topics={TOPICS} distributions={distributions} onChange={onChange} />,
      )
      const [firstInput] = screen.getAllByRole('spinbutton') as HTMLInputElement[]

      fireEvent.change(firstInput!, { target: { value: '8' } })

      const lastCall = onChange.mock.calls.at(-1)?.[0] as DistRow[]
      const updated = lastCall.find((d) => d.topicId === 'topic-1')
      expect(updated?.questionCount).toBe(8)
    })

    it('preserves other distribution rows when updating one topic', () => {
      const onChange = vi.fn()
      const distributions = makeDistributions([
        { topicId: 'topic-1', subtopicId: null, questionCount: 5 },
        { topicId: 'topic-2', subtopicId: null, questionCount: 3 },
      ])
      render(
        <DistributionEditor topics={TOPICS} distributions={distributions} onChange={onChange} />,
      )
      const [firstInput] = screen.getAllByRole('spinbutton') as HTMLInputElement[]

      fireEvent.change(firstInput!, { target: { value: '9' } })

      const lastCall = onChange.mock.calls.at(-1)?.[0] as DistRow[]
      const topic2 = lastCall.find((d) => d.topicId === 'topic-2')
      expect(topic2?.questionCount).toBe(3)
    })
  })

  describe('updateCount — adding a new row', () => {
    it('calls onChange with a new row when the topic has no existing distribution', () => {
      const onChange = vi.fn()
      render(<DistributionEditor topics={TOPICS} distributions={[]} onChange={onChange} />)
      const [firstInput] = screen.getAllByRole('spinbutton') as HTMLInputElement[]

      fireEvent.change(firstInput!, { target: { value: '4' } })

      const lastCall = onChange.mock.calls.at(-1)?.[0] as DistRow[]
      const newRow = lastCall.find((d) => d.topicId === 'topic-1')
      expect(newRow).toBeDefined()
      expect(newRow?.questionCount).toBe(4)
    })
  })

  describe('updateCount — negative value clamping', () => {
    it('clamps a negative input to 0 when updating an existing row', () => {
      const onChange = vi.fn()
      const distributions = makeDistributions([
        { topicId: 'topic-1', subtopicId: null, questionCount: 5 },
      ])
      render(
        <DistributionEditor topics={TOPICS} distributions={distributions} onChange={onChange} />,
      )
      const [firstInput] = screen.getAllByRole('spinbutton') as HTMLInputElement[]

      fireEvent.change(firstInput!, { target: { value: '-5' } })

      const lastCall = onChange.mock.calls.at(-1)?.[0] as DistRow[]
      const updated = lastCall.find((d) => d.topicId === 'topic-1')
      expect(updated?.questionCount).toBe(0)
    })

    it('clamps a negative value to 0 when adding a new row', () => {
      const onChange = vi.fn()
      render(<DistributionEditor topics={TOPICS} distributions={[]} onChange={onChange} />)
      const [firstInput] = screen.getAllByRole('spinbutton') as HTMLInputElement[]

      fireEvent.change(firstInput!, { target: { value: '-3' } })

      const lastCall = onChange.mock.calls.at(-1)?.[0] as DistRow[]
      const newRow = lastCall.find((d) => d.topicId === 'topic-1')
      expect(newRow?.questionCount).toBe(0)
    })
  })

  describe('getCount — default value', () => {
    it('returns 0 for a topic with no matching distribution entry', () => {
      render(
        <DistributionEditor
          topics={[TOPICS[0]!]}
          distributions={[{ topicId: 'topic-99', subtopicId: null, questionCount: 10 }]}
          onChange={vi.fn()}
        />,
      )
      const [input] = screen.getAllByRole('spinbutton') as HTMLInputElement[]
      // topic-1 has no entry in distributions → getCount returns 0
      expect(input!.value).toBe('0')
    })
  })
})
