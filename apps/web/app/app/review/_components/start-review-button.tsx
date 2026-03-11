'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { startReviewSession } from '../actions'

type StartReviewButtonProps = {
  disabled: boolean
}

export function StartReviewButton({ disabled }: StartReviewButtonProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleStart() {
    setLoading(true)
    const result = await startReviewSession()
    if (result.success) {
      // Store session data in sessionStorage for the session page
      sessionStorage.setItem(
        'review-session',
        JSON.stringify({ sessionId: result.sessionId, questionIds: result.questionIds }),
      )
      router.push('/app/review/session')
    } else {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      disabled={disabled || loading}
      onClick={handleStart}
      className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
    >
      {loading ? 'Starting...' : 'Start Smart Review'}
    </button>
  )
}
