'use client'

import { createClient } from '@repo/db/client'
import { useRef, useState } from 'react'
import { toast } from 'sonner'

export function useSignOut() {
  const signingOut = useRef(false)
  const [pending, setPending] = useState(false)

  function failSignOut(cause: unknown) {
    console.error('[SignOutButton] sign-out failed:', cause)
    toast.error('Sign-out failed. Please try again.')
    signingOut.current = false
    setPending(false)
  }

  async function signOut() {
    if (signingOut.current) return
    signingOut.current = true
    setPending(true)
    try {
      const { error } = await createClient().auth.signOut()
      if (error) return failSignOut(error)
    } catch (error) {
      return failSignOut(error)
    }
    // Full document load: drops the signed-out user's client router cache.
    window.location.assign('/')
  }

  return { pending, signOut }
}
