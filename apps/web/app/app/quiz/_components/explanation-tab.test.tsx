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

  it('shows explanation text', () => {
    render(
      <ExplanationTab
        explanationText="The stall speed increases with bank angle."
        explanationImageUrl={null}
      />,
    )
    expect(screen.getByText('The stall speed increases with bank angle.')).toBeInTheDocument()
  })

  it('shows fallback message when explanation text is null', () => {
    render(<ExplanationTab explanationText={null} explanationImageUrl={null} />)
    expect(screen.getByText('No explanation available for this question.')).toBeInTheDocument()
  })

  it('renders ZoomableImage when an explanation image URL is provided', () => {
    render(
      <ExplanationTab
        explanationText={null}
        explanationImageUrl="https://example.com/diagram.png"
      />,
    )
    expect(screen.getByAltText('Explanation illustration')).toBeInTheDocument()
  })

  it('renders the learning objective box when learningObjective is provided', () => {
    render(
      <ExplanationTab
        explanationText="Some explanation."
        explanationImageUrl={null}
        learningObjective="Understand stall characteristics in turns."
      />,
    )
    expect(screen.getByText('Learning Objective')).toBeInTheDocument()
    expect(screen.getByText('Understand stall characteristics in turns.')).toBeInTheDocument()
  })

  it('does not render the learning objective box when learningObjective is not provided', () => {
    render(<ExplanationTab explanationText="Some explanation." explanationImageUrl={null} />)
    expect(screen.queryByText('Learning Objective')).not.toBeInTheDocument()
  })

  it('does not render the learning objective box when learningObjective is null', () => {
    render(
      <ExplanationTab
        explanationText="Some explanation."
        explanationImageUrl={null}
        learningObjective={null}
      />,
    )
    expect(screen.queryByText('Learning Objective')).not.toBeInTheDocument()
  })
})
