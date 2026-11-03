'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FieldError } from '@/components/ui/field-error'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingButton } from '@/components/ui/loading-button'
import { updateDisplayName } from '../actions'

const NameSchema = z.object({
  fullName: z.string().trim().min(1, 'Name is required').max(200, 'Name is too long'),
})

type EditNameFormProps = {
  currentName: string | null
}

export function EditNameForm({ currentName }: Readonly<EditNameFormProps>) {
  const [name, setName] = useState(currentName ?? '')
  const [savedName, setSavedName] = useState((currentName ?? '').trim())
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const result = NameSchema.safeParse({ fullName: name })
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? 'Invalid input')
      return
    }

    startTransition(async () => {
      try {
        const res = await updateDisplayName({ fullName: result.data.fullName })
        if (res.success) {
          setName(result.data.fullName)
          setSavedName(result.data.fullName)
          toast.success('Name updated')
        } else {
          setError(res.error)
        }
      } catch {
        setError('Failed to update name')
      }
    })
  }

  const hasChanged = name.trim() !== savedName

  return (
    <Card>
      <CardHeader>
        <CardTitle>Display Name</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="max-w-field space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">Full name</Label>
            <Input
              id="fullName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
              maxLength={200}
            />
          </div>
          <FieldError role="alert">{error}</FieldError>
          <LoadingButton
            type="submit"
            loading={isPending}
            loadingText="Saving..."
            disabled={!hasChanged}
          >
            Save
          </LoadingButton>
        </form>
      </CardContent>
    </Card>
  )
}
