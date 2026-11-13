import { describe, expect, it } from 'vitest'
import type { SyllabusTree } from '../../syllabus/types'
import { topicRequiresSubtopic } from './topic-requires-subtopic'

const topic = (id: string, subtopics: { id: string }[]) => ({
  id,
  code: id,
  name: id,
  sort_order: 1,
  questionCount: 0,
  subtopics: subtopics.map((s) => ({
    id: s.id,
    code: s.id,
    name: s.id,
    sort_order: 1,
    questionCount: 0,
  })),
})

const TREE: SyllabusTree = [
  {
    id: 'subj-1',
    code: '050',
    name: 'Met',
    short: 'MET',
    sort_order: 1,
    questionCount: 0,
    topics: [topic('with', [{ id: 's1' }]), topic('without', [])],
  },
]

describe('topicRequiresSubtopic', () => {
  it('is true when the topic has subtopics', () => {
    expect(topicRequiresSubtopic(TREE, 'subj-1', 'with')).toBe(true)
  })

  it('is false when the topic has no subtopics', () => {
    expect(topicRequiresSubtopic(TREE, 'subj-1', 'without')).toBe(false)
  })

  it('is false when subject or topic is not selected or unknown', () => {
    expect(topicRequiresSubtopic(TREE, undefined, undefined)).toBe(false)
    expect(topicRequiresSubtopic(TREE, 'subj-1', 'nope')).toBe(false)
    expect(topicRequiresSubtopic(TREE, 'nope', 'with')).toBe(false)
  })
})
