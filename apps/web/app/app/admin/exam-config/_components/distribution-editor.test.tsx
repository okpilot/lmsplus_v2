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

describe('DistributionEditor sub-topic rows', () => {
  const SUBTOPICS = [
    { id: 'st-1', code: '100-04-01', name: 'Alpha objective', availableQuestions: 7 },
    { id: 'st-2', code: '100-04-02', name: 'Bravo objective', availableQuestions: 9 },
    { id: 'st-3', code: '100-04-03', name: 'Charlie objective', availableQuestions: 13 },
  ]

  const TOPIC_WITH_SUBS: TopicInfo = {
    id: 'top-1',
    code: '100-04',
    name: 'Navigation',
    availableQuestions: 55,
    subtopics: SUBTOPICS,
  }

  const TOPIC_PLAIN: TopicInfo = {
    id: 'top-2',
    code: '021',
    name: 'Airframe',
    availableQuestions: 30,
    subtopics: [],
  }

  const ELEVEN = Array.from({ length: 11 }, (_, i) => ({
    id: `st-${i + 1}`,
    code: `100-04-${String(i + 1).padStart(2, '0')}`,
    name: `Objective ${i + 1}`,
    availableQuestions: i + 5,
  }))

  it('renders one input per sub-topic showing its code, name and available count', () => {
    render(<DistributionEditor topics={[TOPIC_WITH_SUBS]} distributions={[]} onChange={vi.fn()} />)
    for (const st of SUBTOPICS) {
      expect(screen.getByLabelText(`${st.code} questions`)).toBeTruthy()
      expect(screen.getByText(st.code)).toBeTruthy()
      expect(screen.getByText(st.name)).toBeTruthy()
      expect(screen.getByText(String(st.availableQuestions))).toBeTruthy()
    }
  })

  it('calls onChange with a sub-topic row appended when the sub-topic has no saved row', () => {
    const onChange = vi.fn()
    const existing: DistRow[] = [{ topicId: 'top-2', subtopicId: null, questionCount: 6 }]
    render(
      <DistributionEditor
        topics={[TOPIC_WITH_SUBS, TOPIC_PLAIN]}
        distributions={existing}
        onChange={onChange}
      />,
    )
    fireEvent.change(screen.getByLabelText('100-04-02 questions'), { target: { value: '3' } })
    const rows = onChange.mock.calls.at(-1)?.[0] as DistRow[]
    expect(rows).toContainEqual({ topicId: 'top-1', subtopicId: 'st-2', questionCount: 3 })
    expect(rows).toContainEqual({ topicId: 'top-2', subtopicId: null, questionCount: 6 })
  })

  it('calls onChange updating only the matching sub-topic row when it is already saved', () => {
    const onChange = vi.fn()
    const existing: DistRow[] = [
      { topicId: 'top-1', subtopicId: 'st-1', questionCount: 2 },
      { topicId: 'top-1', subtopicId: 'st-2', questionCount: 4 },
    ]
    render(
      <DistributionEditor
        topics={[TOPIC_WITH_SUBS]}
        distributions={existing}
        onChange={onChange}
      />,
    )
    fireEvent.change(screen.getByLabelText('100-04-02 questions'), { target: { value: '5' } })
    const rows = onChange.mock.calls.at(-1)?.[0] as DistRow[]
    expect(rows).toHaveLength(2)
    expect(rows).toContainEqual({ topicId: 'top-1', subtopicId: 'st-1', questionCount: 2 })
    expect(rows).toContainEqual({ topicId: 'top-1', subtopicId: 'st-2', questionCount: 5 })
  })

  it('pre-fills a sub-topic input from its saved row', () => {
    const existing: DistRow[] = [{ topicId: 'top-1', subtopicId: 'st-2', questionCount: 4 }]
    render(
      <DistributionEditor topics={[TOPIC_WITH_SUBS]} distributions={existing} onChange={vi.fn()} />,
    )
    expect((screen.getByLabelText('100-04-02 questions') as HTMLInputElement).value).toBe('4')
    expect((screen.getByLabelText('100-04-01 questions') as HTMLInputElement).value).toBe('0')
  })

  it('binds the topic-level input to subtopicId null and labels it Any sub-topic', () => {
    const onChange = vi.fn()
    render(<DistributionEditor topics={[TOPIC_WITH_SUBS]} distributions={[]} onChange={onChange} />)
    expect(screen.getByText('Any sub-topic')).toBeTruthy()
    const [topicInput] = screen.getAllByRole('spinbutton') as HTMLInputElement[]
    fireEvent.change(topicInput!, { target: { value: '4' } })
    const rows = onChange.mock.calls.at(-1)?.[0] as DistRow[]
    expect(rows).toContainEqual({ topicId: 'top-1', subtopicId: null, questionCount: 4 })
  })

  it('omits the Any sub-topic label for a topic without sub-topics', () => {
    render(<DistributionEditor topics={[TOPIC_PLAIN]} distributions={[]} onChange={vi.fn()} />)
    expect(screen.queryByText('Any sub-topic')).toBeNull()
    expect(screen.getAllByRole('spinbutton')).toHaveLength(1)
  })

  it('shows topic available minus saved sub-topic counts on the Any sub-topic row and as its max', () => {
    const topic: TopicInfo = { ...TOPIC_WITH_SUBS, subtopics: ELEVEN }
    const rows: DistRow[] = ELEVEN.map((st) => ({
      topicId: 'top-1',
      subtopicId: st.id,
      questionCount: 2,
    }))
    render(<DistributionEditor topics={[topic]} distributions={rows} onChange={vi.fn()} />)
    expect(screen.getByText('33')).toBeTruthy()
    const [topicInput] = screen.getAllByRole('spinbutton') as HTMLInputElement[]
    expect(topicInput!.max).toBe('33')
  })
})
