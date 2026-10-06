'use client'

import { useState } from 'react'
import { BlockedStartAlert } from '@/app/app/quiz/_components/blocked-start-alert'
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
import { LoadingButton } from '@/components/ui/loading-button'
import { useCodeEntryStart } from '../_hooks/use-code-entry-start'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
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

export function CodeEntryModal({ open, onOpenChange, subjectName, subjectShort }: Readonly<Props>) {
  const [code, setCode] = useState('')
  const { error, setError, isPending, start, reset, blocked } = useCodeEntryStart(code)

  function handleClose(next: boolean) {
    if (!next) {
      setCode('')
      reset()
    }
    onOpenChange(next)
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!ALLOWED_RE.test(code)) {
      setError(`Code must be ${CODE_LENGTH} characters (letters and digits, no I/O/0/1).`)
      return
    }
    start()
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
              onChange={(e) => {
                reset()
                setCode(sanitize(e.target.value))
              }}
              disabled={blocked.saving || isPending}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              inputMode="text"
              maxLength={CODE_LENGTH}
              placeholder="ABC23XYZ"
              className="tabular-nums tracking-widest uppercase"
              aria-invalid={error !== null}
            />
            <BlockedStartAlert message={error} blocked={blocked} startLabel="exam" />
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
            <LoadingButton
              type="submit"
              disabled={!isValid}
              loading={isPending}
              loadingText="Starting…"
            >
              Start exam
            </LoadingButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
