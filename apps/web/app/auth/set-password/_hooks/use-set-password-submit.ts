'use client'

import { type RefObject, useRef, useState } from 'react'
import { NewPasswordSchema } from '@/lib/auth/new-password-schema'
import { setPasswordFromLink } from '../actions'

type FailureResult = Extract<Awaited<ReturnType<typeof setPasswordFromLink>>, { success: false }>

type Status = {
  error: string | null
  loading: boolean
  linkInvalid: boolean
  continueTo: string | null
}

const INITIAL_STATUS: Status = { error: null, loading: false, linkInvalid: false, continueTo: null }

type SubmitContext = {
  values: { password: string; confirmPassword: string }
  tokenHash: string
  lockRef: RefObject<boolean>
  setStatus: (patch: Partial<Status>) => void
}

function applyFailure(result: FailureResult, ctx: SubmitContext) {
  if (result.linkInvalid) {
    ctx.setStatus({ linkInvalid: true })
    return
  }
  // Held when only the Continue link remains; released so the form can be resubmitted.
  ctx.lockRef.current = Boolean(result.redirectTo)
  ctx.setStatus({ error: result.error, continueTo: result.redirectTo ?? null, loading: false })
}

async function runSubmit(ctx: SubmitContext) {
  const parsed = NewPasswordSchema.safeParse(ctx.values)
  if (!parsed.success) {
    ctx.setStatus({ error: parsed.error.issues[0]?.message ?? 'Invalid input' })
    return
  }
  ctx.lockRef.current = true
  ctx.setStatus({ loading: true })
  try {
    const result = await setPasswordFromLink({
      ...parsed.data,
      tokenHash: ctx.tokenHash,
      type: 'recovery',
    })
    if (result.success) {
      window.location.assign(result.redirectTo)
      return
    }
    applyFailure(result, ctx)
  } catch {
    ctx.lockRef.current = false
    ctx.setStatus({ error: 'Unable to update password. Please try again.', loading: false })
  }
}

export function useSetPasswordSubmit(tokenHash: string) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [status, setStatusState] = useState<Status>(INITIAL_STATUS)
  const lockRef = useRef(false)

  function setStatus(patch: Partial<Status>) {
    setStatusState((prev) => ({ ...prev, ...patch }))
  }

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    if (lockRef.current) return
    setStatus({ error: null })
    await runSubmit({ values: { password, confirmPassword }, tokenHash, lockRef, setStatus })
  }

  return { password, setPassword, confirmPassword, setConfirmPassword, status, handleSubmit }
}
