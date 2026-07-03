/**
 * Per-section prompt registry, keyed by the oral-exam section `type`. §1 Interview
 * has a pre-generated mp3 (`audioSrc` — see `apps/web/scripts/generate-elp-prompts.ts`),
 * and §2 Picture Description carries a hand-authored placeholder image (`imageSrc` →
 * `public/elp/prompts/picture-1.svg`) to be replaced by a licensed aviation photo
 * later. The remaining section types (comms/listening/video) remain text-only
 * practice placeholders until their real capture UIs land in later slices.
 */

export type SectionPrompt = {
  id: string
  label: string
  text: string
  audioSrc?: string
  imageSrc?: string
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
    text: 'Look at the picture and describe it in as much detail as you can. Talk about the setting, the aircraft or equipment, any people and what they are doing, and anything that looks unusual or important. Speak for about ninety seconds.',
    imageSrc: '/elp/prompts/picture-1.svg',
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
