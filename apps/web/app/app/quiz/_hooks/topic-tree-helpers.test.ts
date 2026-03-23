import { describe, expect, it } from 'vitest'
import type { TopicWithSubtopics } from '@/lib/queries/quiz'
import { calcFilteredAvailable, calcSelectedCount } from './topic-tree-helpers'

// ---- Fixtures ---------------------------------------------------------------

function makeTopic(
  id: string,
  questionCount: number,
  subtopics: { id: string; questionCount: number }[] = [],
): TopicWithSubtopics {
  return {
    id,
    code: `CODE-${id}`,
    name: `Topic ${id}`,
    questionCount,
    subtopics: subtopics.map((st) => ({
      id: st.id,
      code: `CODE-${st.id}`,
      name: `Subtopic ${st.id}`,
      questionCount: st.questionCount,
    })),
  }
}

// ---- Tests ------------------------------------------------------------------

describe('calcSelectedCount', () => {
  it('returns 0 when no topics are provided', () => {
    expect(calcSelectedCount([], new Set(), new Set())).toBe(0)
  })

  it('returns 0 when topics are present but nothing is checked', () => {
    const topics = [makeTopic('t1', 10)]
    expect(calcSelectedCount(topics, new Set(), new Set())).toBe(0)
  })

  it('counts question count for a leaf topic when it is checked', () => {
    const topics = [makeTopic('t1', 10)]
    const checkedTopics = new Set(['t1'])
    expect(calcSelectedCount(topics, checkedTopics, new Set())).toBe(10)
  })

  it('returns 0 for a leaf topic that is not checked', () => {
    const topics = [makeTopic('t1', 10)]
    expect(calcSelectedCount(topics, new Set(), new Set())).toBe(0)
  })

  it('sums checked leaf topics', () => {
    const topics = [makeTopic('t1', 10), makeTopic('t2', 15), makeTopic('t3', 5)]
    const checkedTopics = new Set(['t1', 't3'])
    expect(calcSelectedCount(topics, checkedTopics, new Set())).toBe(15)
  })

  it('ignores topic question count and uses subtopic counts when topic has subtopics', () => {
    // Topic reports 99 questions but has subtopics — should use subtopic counts instead
    const topics = [
      makeTopic('t1', 99, [
        { id: 'st1', questionCount: 8 },
        { id: 'st2', questionCount: 12 },
      ]),
    ]
    // Even with topic checked, only subtopic counts contribute
    const checkedTopics = new Set(['t1'])
    const checkedSubtopics = new Set(['st1'])
    expect(calcSelectedCount(topics, checkedTopics, checkedSubtopics)).toBe(8)
  })

  it('sums all checked subtopics across a topic with subtopics', () => {
    const topics = [
      makeTopic('t1', 20, [
        { id: 'st1', questionCount: 8 },
        { id: 'st2', questionCount: 12 },
      ]),
    ]
    const checkedSubtopics = new Set(['st1', 'st2'])
    expect(calcSelectedCount(topics, new Set(), checkedSubtopics)).toBe(20)
  })

  it('returns 0 when no subtopics are checked for a topic with subtopics', () => {
    const topics = [
      makeTopic('t1', 20, [
        { id: 'st1', questionCount: 8 },
        { id: 'st2', questionCount: 12 },
      ]),
    ]
    expect(calcSelectedCount(topics, new Set(['t1']), new Set())).toBe(0)
  })

  it('handles a mix of leaf topics and topics with subtopics', () => {
    const topics = [
      makeTopic('t1', 10), // leaf
      makeTopic('t2', 30, [
        { id: 'st1', questionCount: 15 },
        { id: 'st2', questionCount: 15 },
      ]),
    ]
    const checkedTopics = new Set(['t1'])
    const checkedSubtopics = new Set(['st1'])
    // t1 contributes 10, st1 contributes 15
    expect(calcSelectedCount(topics, checkedTopics, checkedSubtopics)).toBe(25)
  })

  it('only counts subtopics belonging to the current topics list', () => {
    const topics = [makeTopic('t1', 10)]
    // st-other belongs to a different topic not in the list
    const checkedSubtopics = new Set(['st-other'])
    expect(calcSelectedCount(topics, new Set(), checkedSubtopics)).toBe(0)
  })
})

describe('calcFilteredAvailable', () => {
  it('returns 0 when no topics are provided', () => {
    expect(calcFilteredAvailable([], new Set(), new Set(), {}, {})).toBe(0)
  })

  it('returns 0 when a leaf topic is not checked', () => {
    const topics = [makeTopic('t1', 10)]
    expect(calcFilteredAvailable(topics, new Set(), new Set(), { t1: 7 }, {})).toBe(0)
  })

  it('returns filtered count for a checked leaf topic', () => {
    const topics = [makeTopic('t1', 10)]
    const checkedTopics = new Set(['t1'])
    expect(calcFilteredAvailable(topics, checkedTopics, new Set(), { t1: 7 }, {})).toBe(7)
  })

  it('returns 0 when leaf topic is checked but has no filtered count entry', () => {
    const topics = [makeTopic('t1', 10)]
    const checkedTopics = new Set(['t1'])
    // filteredByTopic is empty — defaults to 0 via ?? 0
    expect(calcFilteredAvailable(topics, checkedTopics, new Set(), {}, {})).toBe(0)
  })

  it('sums filtered counts for multiple checked leaf topics', () => {
    const topics = [makeTopic('t1', 10), makeTopic('t2', 20)]
    const checkedTopics = new Set(['t1', 't2'])
    const filteredByTopic = { t1: 3, t2: 9 }
    expect(calcFilteredAvailable(topics, checkedTopics, new Set(), filteredByTopic, {})).toBe(12)
  })

  it('ignores unchecked leaf topics when summing', () => {
    const topics = [makeTopic('t1', 10), makeTopic('t2', 20)]
    const checkedTopics = new Set(['t1'])
    const filteredByTopic = { t1: 3, t2: 9 }
    expect(calcFilteredAvailable(topics, checkedTopics, new Set(), filteredByTopic, {})).toBe(3)
  })

  it('returns filtered count for a checked subtopic', () => {
    const topics = [
      makeTopic('t1', 20, [
        { id: 'st1', questionCount: 10 },
        { id: 'st2', questionCount: 10 },
      ]),
    ]
    const checkedSubtopics = new Set(['st1'])
    const filteredBySubtopic = { st1: 4, st2: 6 }
    expect(calcFilteredAvailable(topics, new Set(), checkedSubtopics, {}, filteredBySubtopic)).toBe(
      4,
    )
  })

  it('returns 0 when subtopic is not checked', () => {
    const topics = [makeTopic('t1', 20, [{ id: 'st1', questionCount: 10 }])]
    const filteredBySubtopic = { st1: 5 }
    expect(calcFilteredAvailable(topics, new Set(), new Set(), {}, filteredBySubtopic)).toBe(0)
  })

  it('sums filtered counts for multiple checked subtopics', () => {
    const topics = [
      makeTopic('t1', 30, [
        { id: 'st1', questionCount: 10 },
        { id: 'st2', questionCount: 10 },
        { id: 'st3', questionCount: 10 },
      ]),
    ]
    const checkedSubtopics = new Set(['st1', 'st3'])
    const filteredBySubtopic = { st1: 2, st2: 5, st3: 8 }
    expect(calcFilteredAvailable(topics, new Set(), checkedSubtopics, {}, filteredBySubtopic)).toBe(
      10,
    )
  })

  it('uses subtopic counts for topics with subtopics, ignoring leaf count from filteredByTopic', () => {
    // Topic has subtopics — the leaf branch (filteredByTopic) should not be used
    const topics = [makeTopic('t1', 20, [{ id: 'st1', questionCount: 10 }])]
    const checkedTopics = new Set(['t1'])
    const checkedSubtopics = new Set(['st1'])
    const filteredByTopic = { t1: 99 } // should be ignored since topic has subtopics
    const filteredBySubtopic = { st1: 6 }
    expect(
      calcFilteredAvailable(
        topics,
        checkedTopics,
        checkedSubtopics,
        filteredByTopic,
        filteredBySubtopic,
      ),
    ).toBe(6)
  })

  it('handles a mix of leaf topics and topics with subtopics', () => {
    const topics = [
      makeTopic('t1', 10), // leaf
      makeTopic('t2', 30, [
        { id: 'st1', questionCount: 15 },
        { id: 'st2', questionCount: 15 },
      ]),
    ]
    const checkedTopics = new Set(['t1'])
    const checkedSubtopics = new Set(['st1'])
    const filteredByTopic = { t1: 4 }
    const filteredBySubtopic = { st1: 7, st2: 8 }
    expect(
      calcFilteredAvailable(
        topics,
        checkedTopics,
        checkedSubtopics,
        filteredByTopic,
        filteredBySubtopic,
      ),
    ).toBe(11) // 4 (t1) + 7 (st1)
  })
})
