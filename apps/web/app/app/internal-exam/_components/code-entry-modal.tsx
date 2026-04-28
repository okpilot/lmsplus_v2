'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { sessionHandoffKey } from '../../quiz/session/_utils/quiz-session-storage'
import { startInternalExam } from '../actions/start-internal-exam'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
  subjectName: string
  subjectShort: string
}

const CODE_LENGTH = 8
// Crockford-style alphabet shared with the issue-code RPC (no I/O/0/1).
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const ALLOWED_RE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`)

function sanitize(input: string): string {
  const upper = input.toUpperCase()
  let out = ''
  for (const ch of upper) {
    if (CODE_ALPHABET.includes(ch)) out += ch
    if (out.length >= CODE_LENGTH) break
  }
  return out
}

export function CodeEntryModal({
  open,
  onOpenChange,
  userId,
  subjectName,
  subjectShort,
}: Readonly<Props>) {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleClose(next: boolean) {
    if (!next) {
      setCode('')
      setError(null)
    }
    onOpenChange(next)
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (!ALLOWED_RE.test(code)) {
      setError(`Code must be ${CODE_LENGTH} characters (letters and digits, no I/O/0/1).`)
      return
    }
    startTransition(async () => {
      try {
        const result = await startInternalExam({ code })
        if (result.success) {
          try {
            sessionStorage.setItem(
              sessionHandoffKey(userId),
              JSON.stringify({
                userId,
                sessionId: result.sessionId,
                questionIds: result.questionIds,
                subjectName,
                subjectCode: subjectShort,
                mode: 'exam',
                examMode: 'internal_exam',
                timeLimitSeconds: result.timeLimitSeconds,
                passMark: result.passMark,
                startedAt: result.startedAt,
              }),
            )
          } catch (storageErr) {
            console.error('[code-entry-modal] sessionStorage handoff failed:', storageErr)
            // Internal exam cannot be discarded by design — surface the error
            // and let the recovery banner handle resume on next visit.
            setError(
              'Unable to start internal exam right now. Please try again or refresh the page.',
            )
            return
          }
          router.push('/app/quiz/session')
          return
        }
        setError(result.error)
      } catch {
        setError('Something went wrong. Please try again.')
      }
    })
  }

  const isValid = ALLOWED_RE.test(code)

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enter internal exam code</DialogTitle>
          <DialogDescription>
            {subjectShort ? `${subjectShort} — ` : ''}
            {subjectName}. Paste or type the {CODE_LENGTH}-character code provided by your
            administrator.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={handleSubmit}
          className="space-y-3"
          data-testid="code-entry-form"
          noValidate
        >
          <div className="space-y-2">
            <Label htmlFor="internal-exam-code">Code</Label>
            <Input
              id="internal-exam-code"
              data-testid="code-input"
              value={code}
              onChange={(e) => setCode(sanitize(e.target.value))}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              inputMode="text"
              maxLength={CODE_LENGTH}
              placeholder="ABC23XYZ"
              className="font-mono tracking-widest uppercase"
              aria-invalid={error !== null}
            />
            {error ? (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleClose(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !isValid}>
              {isPending ? 'Starting…' : 'Start exam'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
