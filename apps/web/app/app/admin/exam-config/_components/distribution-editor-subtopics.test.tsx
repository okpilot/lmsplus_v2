import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TopicInfo } from '../types'
import { DistributionEditor } from './distribution-editor'

type DistRow = { topicId: string; subtopicId: string | null; questionCount: number }

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

beforeEach(() => {
  vi.resetAllMocks()
})

describe('DistributionEditor sub-topic rows', () => {
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
