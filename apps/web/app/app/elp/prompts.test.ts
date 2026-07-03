import { describe, expect, it } from 'vitest'
import { getSectionPrompt, INTERVIEW_PROMPTS, SECTION_PROMPTS } from './prompts'

describe('getSectionPrompt', () => {
  it('returns the interview prompt with its pre-generated audio for the interview type', () => {
    const prompt = getSectionPrompt('interview')
    expect(prompt.id).toBe('interview-1')
    expect(prompt.label).toBe('§1 Interview')
    expect(prompt.audioSrc).toBe('/elp/prompts/interview-1.mp3')
  })

  it('returns a labelled placeholder prompt with no audio for the picture type', () => {
    const prompt = getSectionPrompt('picture')
    expect(prompt.label).toBe('§2 Picture Description')
    expect(prompt.text).toContain('[practice placeholder]')
    expect(prompt.audioSrc).toBeUndefined()
  })

  it('falls back to a generic placeholder prompt for an unrecognised section type', () => {
    const prompt = getSectionPrompt('does-not-exist')
    expect(prompt.text).toContain('[practice placeholder]')
    expect(prompt.audioSrc).toBeUndefined()
  })
})

describe('INTERVIEW_PROMPTS', () => {
  it('derives a single-entry list from the interview registry entry', () => {
    expect(INTERVIEW_PROMPTS).toHaveLength(1)
    expect(INTERVIEW_PROMPTS[0]).toBe(SECTION_PROMPTS.interview)
  })
})
