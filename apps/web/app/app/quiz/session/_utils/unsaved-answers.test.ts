import { beforeEach, describe, expect, it } from 'vitest'
import {
  _resetUnsavedAnswers,
  failedAnswers,
  settleAnswerSend,
  trackAnswerSend,
} from './unsaved-answers'

const S = 'session-1'
const Q = 'question-1'

beforeEach(() => {
  _resetUnsavedAnswers()
})

describe('unsaved answers', () => {
  it('lists an answer whose save failed', () => {
    const input = { a: 1 }
    trackAnswerSend({ sessionId: S, questionId: Q, input })
    settleAnswerSend({ sessionId: S, questionId: Q, input, settled: false })
    expect(failedAnswers(S)).toEqual([{ questionId: Q, input }])
  })

  it('does not list an answer whose save landed', () => {
    const input = { a: 1 }
    trackAnswerSend({ sessionId: S, questionId: Q, input })
    settleAnswerSend({ sessionId: S, questionId: Q, input, settled: true })
    expect(failedAnswers(S)).toEqual([])
  })

  it('does not list an answer that is still being sent', () => {
    trackAnswerSend({ sessionId: S, questionId: Q, input: { a: 1 } })
    expect(failedAnswers(S)).toEqual([])
  })

  it('replaces an older failed answer when a newer one is sent', () => {
    const older = { a: 1 }
    const newer = { a: 2 }
    trackAnswerSend({ sessionId: S, questionId: Q, input: older })
    settleAnswerSend({ sessionId: S, questionId: Q, input: older, settled: false })
    trackAnswerSend({ sessionId: S, questionId: Q, input: newer })
    expect(failedAnswers(S)).toEqual([])
    settleAnswerSend({ sessionId: S, questionId: Q, input: newer, settled: false })
    expect(failedAnswers(S)).toEqual([{ questionId: Q, input: newer }])
  })

  it('ignores an older send that fails after a newer one started', () => {
    const older = { a: 1 }
    const newer = { a: 2 }
    trackAnswerSend({ sessionId: S, questionId: Q, input: older })
    trackAnswerSend({ sessionId: S, questionId: Q, input: newer })
    settleAnswerSend({ sessionId: S, questionId: Q, input: older, settled: false })
    expect(failedAnswers(S)).toEqual([])
  })

  it('keeps a newer failure when an older send succeeds late', () => {
    const older = { a: 1 }
    const newer = { a: 2 }
    trackAnswerSend({ sessionId: S, questionId: Q, input: older })
    trackAnswerSend({ sessionId: S, questionId: Q, input: newer })
    settleAnswerSend({ sessionId: S, questionId: Q, input: newer, settled: false })
    settleAnswerSend({ sessionId: S, questionId: Q, input: older, settled: true })
    expect(failedAnswers(S)).toEqual([{ questionId: Q, input: newer }])
  })

  it('keeps sessions separate', () => {
    const input = { a: 1 }
    trackAnswerSend({ sessionId: S, questionId: Q, input })
    settleAnswerSend({ sessionId: S, questionId: Q, input, settled: false })
    expect(failedAnswers(S)).toEqual([{ questionId: Q, input }])
    expect(failedAnswers('session-2')).toEqual([])
  })
})
