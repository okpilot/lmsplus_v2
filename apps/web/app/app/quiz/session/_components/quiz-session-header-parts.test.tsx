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
vi.mock('./quiz-header-action', () => ({
  QuizHeaderAction: (p: { onFinishClick: () => void; submitting: boolean }) => (
    <button type="button" data-testid="action" disabled={p.submitting} onClick={p.onFinishClick} />
  ),
}))
vi.mock('./exam-session-header', () => ({
  ExamBadge: (p: { mode?: string }) => <span data-testid="badge">{p.mode}</span>,
}))

import { DesktopTabs, HeaderControls, HeaderStatus } from './quiz-session-header-parts'

const base = {
  isExam: false,
  currentIndex: 2,
  totalQuestions: 5,
  timerStart: 1234,
  onTimeExpired: vi.fn(),
}

describe('HeaderStatus', () => {
  it('shows the exam badge and countdown for a timed exam, without the session timer', () => {
    const onTimeExpired = vi.fn()
    render(
      <HeaderStatus
        {...base}
        isExam
        examMode="internal_exam"
        timeLimitSeconds={600}
        onTimeExpired={onTimeExpired}
      />,
    )
    expect(screen.getByTestId('badge').textContent).toBe('internal_exam')
    const cd = screen.getByTestId('countdown')
    expect(cd.getAttribute('data-limit')).toBe('600')
    expect(cd.getAttribute('data-start')).toBe('1234')
    cd.click()
    expect(onTimeExpired).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('session-timer')).toBeNull()
    expect(screen.getByText('Q 3 / 5')).toBeTruthy()
  })

  it('shows the badge but no countdown for an exam without a time limit', () => {
    render(<HeaderStatus {...base} isExam />)
    expect(screen.getByTestId('badge')).toBeTruthy()
    expect(screen.queryByTestId('countdown')).toBeNull()
  })

  it('shows the session timer seeded with prior active time outside exams', () => {
    render(<HeaderStatus {...base} initialActiveMs={4200} />)
    expect(screen.getByTestId('session-timer').textContent).toBe('4200')
    expect(screen.queryByTestId('badge')).toBeNull()
    expect(screen.queryByTestId('countdown')).toBeNull()
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
})

describe('HeaderControls', () => {
  it('renders the shortcut legend, theme toggle and header action, wiring Finish', () => {
    const onFinishClick = vi.fn()
    render(<HeaderControls isExam submitting={false} onFinishClick={onFinishClick} />)
    expect(screen.getByTestId('legend').textContent).toBe('true')
    expect(screen.getByTestId('theme-toggle')).toBeTruthy()
    screen.getByTestId('action').click()
    expect(onFinishClick).toHaveBeenCalledTimes(1)
  })
})
