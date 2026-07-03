import { describe, expect, it } from 'vitest'
import type { OralSessionDetail } from '@/lib/queries/oral-exam-session'
import { getSessionRedirectPath } from './session-redirect'

const SESSION_ID = '11111111-1111-1111-1111-111111111111'

function buildSession(status: string): OralSessionDetail {
  return {
    id: SESSION_ID,
    status,
    mode: 'practice',
    sections: [{ sectionNo: 1, type: 'interview' }],
    responses: [],
  }
}

describe('getSessionRedirectPath', () => {
  it('redirects to ELP home when the session does not exist', () => {
    expect(getSessionRedirectPath(null, SESSION_ID)).toBe('/app/elp')
  })

  it('redirects to the report page when the session has moved past in_progress', () => {
    expect(getSessionRedirectPath(buildSession('graded'), SESSION_ID)).toBe(
      `/app/elp/report/${SESSION_ID}`,
    )
  })

  it('does not redirect when the session is in_progress', () => {
    expect(getSessionRedirectPath(buildSession('in_progress'), SESSION_ID)).toBeNull()
  })
})
