'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { recordConsent } from '../actions'
import { ConsentCheckbox } from './consent-checkbox'

export function ConsentForm() {
  const router = useRouter()
  const [acceptedTos, setAcceptedTos] = useState(false)
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        const res = await recordConsent({ acceptedTos, acceptedPrivacy })
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
            <ConsentCheckbox
              id="consent-tos"
              checked={acceptedTos}
              onCheckedChange={setAcceptedTos}
              disabled={isPending}
              label="I accept the"
              linkText="Terms of Service"
              linkHref="/legal/terms"
              required
            />
            <ConsentCheckbox
              id="consent-privacy"
              checked={acceptedPrivacy}
              onCheckedChange={setAcceptedPrivacy}
              disabled={isPending}
              label="I accept the"
              linkText="Privacy Policy"
              linkHref="/legal/privacy"
              required
            />
          </div>

          <p className="text-xs text-muted-foreground">
            We use essential cookies only to keep you signed in. No tracking or analytics cookies
            are used.
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
