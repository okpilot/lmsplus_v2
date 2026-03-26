'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateDisplayName } from '../actions'

const NameSchema = z.object({
  fullName: z.string().trim().min(1, 'Name is required').max(200, 'Name is too long'),
})

type EditNameFormProps = {
  currentName: string | null
}

export function EditNameForm({ currentName }: EditNameFormProps) {
  const [name, setName] = useState(currentName ?? '')
  const [savedName, setSavedName] = useState((currentName ?? '').trim())
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
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
        <form onSubmit={handleSubmit} className="space-y-4">
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
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={isPending || !hasChanged}>
            {isPending ? 'Saving...' : 'Save'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
