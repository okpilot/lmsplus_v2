import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type ProgressFixture, setupProgressFixture } from './quiz-progress-fixture'

const NOT_FOUND = /could not find the function|does not exist|schema cache/i
const ZERO_UUID = '00000000-0000-0000-0000-000000000000'

describe('dropped RPCs submit_quiz_answer and get_student_profile_stats', () => {
  let f: ProgressFixture

  beforeAll(async () => {
    f = await setupProgressFixture('dropped')
  })
  afterAll(async () => {
    await f.teardown()
  })

  it('submit_quiz_answer is not callable as an authenticated student', async () => {
    const { data, error } = await f.student.rpc('submit_quiz_answer', {
      p_question_id: ZERO_UUID,
      p_session_id: ZERO_UUID,
      p_selected_option: 'a',
      p_response_time_ms: 1000,
    })

    expect(data).toBeNull()
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(NOT_FOUND)
  })

  it('get_student_profile_stats is not callable as an authenticated student', async () => {
    const { data, error } = await f.student.rpc('get_student_profile_stats')

    expect(data).toBeNull()
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(NOT_FOUND)
  })
})
