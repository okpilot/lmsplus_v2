/**
 * Per-section prompt registry, keyed by the oral-exam section `type`. Only the
 * §1 Interview has a pre-generated mp3 (`audioSrc` points at a file under
 * `apps/web/public/elp/prompts/` — see `apps/web/scripts/generate-elp-prompts.ts`
 * for how the audio is produced from `text`). The remaining section types show a
 * clearly-labelled practice placeholder with no audio until their real per-type
 * capture UIs land in later slices.
 */

export type SectionPrompt = {
  id: string
  label: string
  text: string
  audioSrc?: string
}

export const SECTION_PROMPTS: Record<string, SectionPrompt> = {
  interview: {
    id: 'interview-1',
    label: '§1 Interview',
    text: 'Tell me about your flight training so far — where you train, what you fly, and what stage you have reached.',
    audioSrc: '/elp/prompts/interview-1.mp3',
  },
  picture: {
    id: 'picture-1',
    label: '§2 Picture Description',
    text: '[practice placeholder] Describe an aviation scene in detail — the real picture-description task with an image arrives in a later slice.',
  },
  comms: {
    id: 'comms-1',
    label: '§3 Radio Communications',
    text: '[practice placeholder] Respond to a simulated radio call — the real radio-communications task arrives in a later slice.',
  },
  listening: {
    id: 'listening-1',
    label: '§4 Listening Comprehension',
    text: '[practice placeholder] Answer questions about a spoken passage — the real listening-comprehension task arrives in a later slice.',
  },
  video: {
    id: 'video-1',
    label: '§5 Video Description',
    text: '[practice placeholder] Describe what happens in a short clip — the real video-description task arrives in a later slice.',
  },
}

const FALLBACK_PROMPT: SectionPrompt = {
  id: 'unknown-1',
  label: 'Oral Exam Section',
  text: '[practice placeholder] Record your spoken answer for this section.',
}

/** Returns the prompt for a section `type`, or a generic fallback for an
 * unrecognised type so the runner never renders an empty prompt. */
export function getSectionPrompt(type: string): SectionPrompt {
  return SECTION_PROMPTS[type] ?? FALLBACK_PROMPT
}

/**
 * Derived §1-only view kept for `apps/web/scripts/generate-elp-prompts.ts`,
 * which iterates it to synthesize the interview mp3(s). Do not inline — the
 * script imports this name.
 */
export const INTERVIEW_PROMPTS: readonly SectionPrompt[] = [getSectionPrompt('interview')]
