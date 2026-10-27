import { describe, expect, it } from 'vitest'
import type { TopicInfo } from '../types'
import { topicRemaining } from './topic-remaining'

function topic(availableQuestions: number, subPools: number[]): TopicInfo {
  return {
    id: 't',
    code: '100-04',
    name: 'Topic',
    availableQuestions,
    subtopics: subPools.map((p, i) => ({
      id: `s${i}`,
      code: `100-04-0${i}`,
      name: `Sub ${i}`,
      availableQuestions: p,
    })),
  }
}

describe('topicRemaining', () => {
  it('returns the topic pool when there are no sub-topics', () => {
    expect(topicRemaining(topic(40, []), () => 5)).toBe(40)
  })

  it('subtracts sub-topic counts from the topic pool', () => {
    const t = topic(55, Array(11).fill(10))
    expect(topicRemaining(t, (_, sub) => (sub ? 2 : 0))).toBe(33)
  })

  it('caps a sub-topic draw at its own pool', () => {
    const t = topic(10, [3, 10])
    expect(topicRemaining(t, (_, sub) => (sub === 's0' ? 8 : 0))).toBe(7)
  })

  it('floors at 0', () => {
    const t = topic(5, [10, 10])
    expect(topicRemaining(t, (_, sub) => (sub ? 10 : 0))).toBe(0)
  })
})
