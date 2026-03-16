import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ExplanationTab } from './explanation-tab'

vi.mock('../../_components/zoomable-image', () => ({
  ZoomableImage: ({ src, alt }: { src: string; alt: string }) => (
    // biome-ignore lint/performance/noImgElement: test mock — no Next.js Image needed
    <img src={src} alt={alt} />
  ),
}))

vi.mock('../../_components/markdown-text', () => ({
  MarkdownText: ({ children }: { children: string }) => <span>{children}</span>,
}))

describe('ExplanationTab', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('shows "correctly" message and explanation text when answer is correct', () => {
    render(
      <ExplanationTab
        isCorrect={true}
        explanationText="The stall speed increases with bank angle."
        explanationImageUrl={null}
      />,
    )
    expect(screen.getByText('You answered correctly.')).toBeInTheDocument()
    expect(screen.getByText('The stall speed increases with bank angle.')).toBeInTheDocument()
  })

  it('shows "incorrectly" message and explanation text when answer is wrong', () => {
    render(
      <ExplanationTab
        isCorrect={false}
        explanationText="The stall speed increases with bank angle."
        explanationImageUrl={null}
      />,
    )
    expect(screen.getByText('You answered incorrectly.')).toBeInTheDocument()
    expect(screen.getByText('The stall speed increases with bank angle.')).toBeInTheDocument()
  })

  it('shows no correctness message when question has not been answered', () => {
    render(
      <ExplanationTab
        isCorrect={null}
        explanationText="Background explanation."
        explanationImageUrl={null}
      />,
    )
    expect(screen.queryByText('You answered correctly.')).not.toBeInTheDocument()
    expect(screen.queryByText('You answered incorrectly.')).not.toBeInTheDocument()
    expect(screen.getByText('Background explanation.')).toBeInTheDocument()
  })

  it('shows fallback message when explanation text is null', () => {
    render(<ExplanationTab isCorrect={null} explanationText={null} explanationImageUrl={null} />)
    expect(screen.getByText('No explanation available for this question.')).toBeInTheDocument()
  })

  it('renders ZoomableImage when an explanation image URL is provided', () => {
    render(
      <ExplanationTab
        isCorrect={true}
        explanationText={null}
        explanationImageUrl="https://example.com/diagram.png"
      />,
    )
    expect(screen.getByAltText('Explanation illustration')).toBeInTheDocument()
  })
})
