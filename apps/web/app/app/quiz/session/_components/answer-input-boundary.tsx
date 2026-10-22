'use client'

import * as Sentry from '@sentry/nextjs'
import { Component, type ReactNode } from 'react'
import { StatusNote } from '@/components/kit/status-note'
import { Button } from '@/components/ui/button'

type State = { failed: boolean }

/** Contains a failed answer-input load to the input, leaving the rest of the runner intact. */
export class AnswerInputBoundary extends Component<Readonly<{ children: ReactNode }>, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    Sentry.captureException(error)
    console.error('[AnswerInputBoundary] answer input failed to load:', error)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <StatusNote tone="bad">
        <p>This answer input could not be loaded.</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => this.setState({ failed: false })}
        >
          Retry
        </Button>
      </StatusNote>
    )
  }
}
