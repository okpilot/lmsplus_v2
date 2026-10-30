import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/app/app/_components/session-timer', () => ({
  SessionTimer: (p: { initialElapsedMs?: number }) => (
    <div data-testid="session-timer">{String(p.initialElapsedMs)}</div>
  ),
}))
vi.mock('../../_components/exam-countdown-timer', () => ({
  ExamCountdownTimer: (p: {
    timeLimitSeconds: number
    startedAt: number
    onExpired: () => void
  }) => (
    <button
      type="button"
      data-testid="countdown"
      data-limit={p.timeLimitSeconds}
      data-start={p.startedAt}
      onClick={p.onExpired}
    />
  ),
}))
vi.mock('../../_components/question-tabs', () => ({
  QuestionTabs: (p: { activeTab: string; onTabChange: (t: 'question') => void }) => (
    <button
      type="button"
      data-testid="tabs"
      data-active={p.activeTab}
      onClick={() => p.onTabChange('question')}
    />
  ),
}))
vi.mock('@/app/app/_components/theme-toggle', () => ({
  ThemeToggle: () => <div data-testid="theme-toggle" />,
}))
vi.mock('./keyboard-legend', () => ({
  KeyboardLegend: (p: { isExam: boolean }) => <div data-testid="legend">{String(p.isExam)}</div>,
}))

import { DesktopTabs, HeaderControls, ModeHeading } from './quiz-session-header-parts'

const base = {
  isExam: false,
  timerStart: 1234,
  onTimeExpired: vi.fn(),
}

describe('ModeHeading', () => {
  it.each([
    ['study session', { isExam: false, mode: 'study' as const }, 'Study'],
    ['discovery session', { isExam: false, mode: 'discovery' as const }, 'Discovery'],
    ['internal exam', { isExam: true, examMode: 'internal_exam' as const }, 'Internal Exam'],
    ['exam without a stored mode', { isExam: true }, 'Practice Exam'],
  ])('names the mode for a %s', (_name, props, label) => {
    render(<ModeHeading {...props} />)
    expect(screen.getByText(label)).toHaveClass('text-label', 'font-semibold')
  })

  it('shows the subject beneath the mode as muted caption text', () => {
    render(<ModeHeading isExam={false} subjectName="Air Law" />)
    expect(screen.getByText('Air Law')).toHaveClass('text-caption', 'text-muted-foreground')
  })

  it('omits the subject line when there is none', () => {
    render(<ModeHeading isExam={false} />)
    expect(screen.queryByText('Air Law')).toBeNull()
  })

  it('never renders an uppercase badge', () => {
    render(<ModeHeading isExam examMode="mock_exam" />)
    expect(screen.getByText('Practice Exam').className).not.toMatch(/uppercase/)
  })
})

describe('DesktopTabs', () => {
  it('renders the question tabs with the active tab and forwards tab changes', () => {
    const onTabChange = vi.fn()
    render(<DesktopTabs activeTab="question" onTabChange={onTabChange} />)
    const tabs = screen.getByTestId('tabs')
    expect(tabs.getAttribute('data-active')).toBe('question')
    tabs.click()
    expect(onTabChange).toHaveBeenCalledWith('question')
  })

  it('moves into the header only from the desktop breakpoint', () => {
    render(<DesktopTabs activeTab="question" onTabChange={vi.fn()} />)
    expect(screen.getByTestId('tabs').parentElement?.parentElement).toHaveClass('hidden', 'lg:flex')
  })
})

describe('HeaderControls', () => {
  const controls = { ...base, submitting: false, onFinishClick: vi.fn() }

  it('renders the shortcut legend, theme toggle and an outline Finish button', () => {
    const onFinishClick = vi.fn()
    render(<HeaderControls {...controls} isExam onFinishClick={onFinishClick} />)
    expect(screen.getByTestId('legend').textContent).toBe('true')
    expect(screen.getByTestId('theme-toggle')).toBeTruthy()
    const finish = screen.getByRole('button', { name: 'Finish Practice Exam' })
    expect(finish).toHaveClass('border-border')
    finish.click()
    expect(onFinishClick).toHaveBeenCalledTimes(1)
  })

  it('names the Finish button after the exam mode', () => {
    render(<HeaderControls {...controls} isExam examMode="internal_exam" />)
    expect(screen.getByRole('button', { name: 'Finish Internal Exam' })).toBeTruthy()
  })

  it('disables Finish and marks it busy while submitting', () => {
    render(<HeaderControls {...controls} submitting />)
    const finish = screen.getByRole('button', { name: /finish test/i })
    expect(finish).toBeDisabled()
    expect(finish).toHaveAttribute('aria-busy', 'true')
  })

  it('replaces Finish with Exit in Discovery', () => {
    const onExitClick = vi.fn()
    render(<HeaderControls {...controls} isDiscovery onExitClick={onExitClick} />)
    expect(screen.queryByRole('button', { name: /finish/i })).toBeNull()
    screen.getByRole('button', { name: 'Exit' }).click()
    expect(onExitClick).toHaveBeenCalledTimes(1)
  })

  it('shows the countdown for a timed exam, without the session timer', () => {
    const onTimeExpired = vi.fn()
    render(
      <HeaderControls {...controls} isExam timeLimitSeconds={600} onTimeExpired={onTimeExpired} />,
    )
    const cd = screen.getByTestId('countdown')
    expect(cd.getAttribute('data-limit')).toBe('600')
    expect(cd.getAttribute('data-start')).toBe('1234')
    cd.click()
    expect(onTimeExpired).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('session-timer')).toBeNull()
  })

  it('shows no timer for an exam without a time limit', () => {
    render(<HeaderControls {...controls} isExam />)
    expect(screen.queryByTestId('countdown')).toBeNull()
    expect(screen.queryByTestId('session-timer')).toBeNull()
  })

  it('shows the session timer seeded with prior active time outside exams', () => {
    render(<HeaderControls {...controls} initialActiveMs={4200} />)
    expect(screen.getByTestId('session-timer').textContent).toBe('4200')
    expect(screen.queryByTestId('countdown')).toBeNull()
  })

  it('stacks the controls on the sticky z token', () => {
    render(<HeaderControls {...controls} isExam />)
    const wrapper = screen.getByTestId('theme-toggle').parentElement
    expect(wrapper).toHaveClass('z-sticky')
    expect(wrapper?.className).not.toMatch(/(^|\s)z-10(\s|$)/)
  })
})
