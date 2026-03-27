'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { recordConsent } from '../actions'

export function ConsentForm() {
  const router = useRouter()
  const [acceptedTos, setAcceptedTos] = useState(false)
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false)
  const [acceptedAnalytics, setAcceptedAnalytics] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        const res = await recordConsent({ acceptedTos, acceptedPrivacy, acceptedAnalytics })
        if (res.success) {
          router.push('/app/dashboard')
        } else {
          setError(res.error)
        }
      } catch {
        setError('Something went wrong. Please try again.')
      }
    })
  }

  const canSubmit = acceptedTos && acceptedPrivacy && !isPending

  return (
    <Card>
      <CardHeader>
        <CardTitle>Welcome to LMS Plus</CardTitle>
        <CardDescription>Please review and accept our policies to continue.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <Checkbox
                id="consent-tos"
                checked={acceptedTos}
                onCheckedChange={(c) => setAcceptedTos(c === true)}
                disabled={isPending}
                aria-label="I accept the Terms of Service"
              />
              <span className="text-sm leading-snug">
                I accept the{' '}
                <a
                  href="/legal/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-4 hover:text-primary"
                >
                  Terms of Service
                </a>{' '}
                <span className="text-destructive">*</span>
              </span>
            </div>

            <div className="flex items-start gap-3">
              <Checkbox
                id="consent-privacy"
                checked={acceptedPrivacy}
                onCheckedChange={(c) => setAcceptedPrivacy(c === true)}
                disabled={isPending}
                aria-label="I accept the Privacy Policy"
              />
              <span className="text-sm leading-snug">
                I accept the{' '}
                <a
                  href="/legal/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-4 hover:text-primary"
                >
                  Privacy Policy
                </a>{' '}
                <span className="text-destructive">*</span>
              </span>
            </div>

            <div className="flex items-start gap-3">
              <Checkbox
                id="consent-analytics"
                checked={acceptedAnalytics}
                onCheckedChange={(c) => setAcceptedAnalytics(c === true)}
                disabled={isPending}
                aria-label="I consent to analytics cookies"
              />
              <span className="text-sm leading-snug">
                I consent to analytics cookies
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Help us improve the platform
                </span>
              </span>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            We use essential cookies only to keep you signed in. No consent is needed for these.
          </p>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" disabled={!canSubmit} className="w-full">
            {isPending ? 'Saving...' : 'Continue'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
