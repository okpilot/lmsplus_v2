'use client'

import * as Sentry from '@sentry/nextjs'
import { Component, type ReactNode } from 'react'
import { StatusNote } from '@/components/kit/status-note'
import { Button } from '@/components/ui/button'
import { isStaleDeploymentError } from '@/lib/stale-deployment'

type State = { error: unknown | null }

/**
 * Contains a failed answer-input chunk load to the input, leaving the rest of the runner intact.
 * Any other render error is rethrown to the route boundary.
 */
export class AnswerInputBoundary extends Component<
  Readonly<{ children: ReactNode; onRetry?: () => void }>,
  State
> {
  state: State = { error: null }

  static getDerivedStateFromError(error: unknown): State {
    return { error }
  }

  componentDidCatch(error: unknown) {
    if (!isStaleDeploymentError(error)) return
    Sentry.captureException(error)
    console.error('[AnswerInputBoundary] answer input failed to load:', error)
  }

  retry = () => {
    this.props.onRetry?.()
    this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (error === null) return this.props.children
    if (!isStaleDeploymentError(error)) throw error
    return (
      <StatusNote tone="bad">
        <p>This answer input could not be loaded.</p>
        <Button type="button" variant="outline" size="sm" onClick={this.retry}>
          Retry
        </Button>
      </StatusNote>
    )
  }
}
