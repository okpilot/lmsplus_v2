/**
 * §1 Interview prompt registry. `audioSrc` points at a pre-generated mp3 under
 * `apps/web/public/elp/prompts/` — see `apps/web/scripts/generate-elp-prompts.ts`
 * for how the audio is produced from `text`.
 */

export type InterviewPrompt = {
  id: string
  text: string
  audioSrc: string
}

export const INTERVIEW_PROMPTS: readonly InterviewPrompt[] = [
  {
    id: 'interview-1',
    text: 'Tell me about your flight training so far — where you train, what you fly, and what stage you have reached.',
    audioSrc: '/elp/prompts/interview-1.mp3',
  },
]
