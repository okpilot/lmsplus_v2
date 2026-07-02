import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AudioPromptPlayer } from './audio-prompt-player'

describe('AudioPromptPlayer', () => {
  it('renders an audio element pointing at the given prompt source', () => {
    render(<AudioPromptPlayer src="/elp/prompts/interview-1.mp3" label="Prompt 1" />)

    const audio = screen.getByLabelText('Prompt 1')
    expect(audio.tagName).toBe('AUDIO')
    expect(audio).toHaveAttribute('src', '/elp/prompts/interview-1.mp3')
    expect(audio).toHaveAttribute('controls')
  })

  it('shows the label text when one is provided', () => {
    render(<AudioPromptPlayer src="/elp/prompts/interview-1.mp3" label="Prompt 1" />)
    expect(screen.getByText('Prompt 1')).toBeInTheDocument()
  })

  it('falls back to a generic accessible name when no label is given', () => {
    render(<AudioPromptPlayer src="/elp/prompts/interview-1.mp3" />)
    expect(screen.getByLabelText('Interview prompt audio')).toBeInTheDocument()
  })
})
