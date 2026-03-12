import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MarkdownText } from './markdown-text'

describe('MarkdownText', () => {
  it('renders plain text', () => {
    render(<MarkdownText>Hello world</MarkdownText>)
    expect(screen.getByText('Hello world')).toBeInTheDocument()
  })

  it('renders a bulleted list from markdown', () => {
    render(<MarkdownText>{'- Alpha\n- Beta'}</MarkdownText>)
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
  })

  it('renders bold text from markdown', () => {
    render(<MarkdownText>{'**important**'}</MarkdownText>)
    const el = screen.getByText('important')
    expect(el.tagName).toBe('STRONG')
  })

  it('applies custom className', () => {
    const { container } = render(<MarkdownText className="text-sm text-red-500">Test</MarkdownText>)
    const wrapper = container.firstElementChild
    expect(wrapper?.className).toContain('text-sm')
    expect(wrapper?.className).toContain('text-red-500')
  })
})
