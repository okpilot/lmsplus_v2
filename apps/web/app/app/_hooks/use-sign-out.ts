'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { isStaleDeploymentError, reloadOnceForStaleDeployment } from '@/lib/stale-deployment'

/** Resolves to the error only when sign-out failed and a local session remains. */
async function signOutClient() {
  const { createClient } = await import('@repo/db/client')
  const supabase = createClient()
  const { error } = await supabase.auth.signOut()
  if (!error) return null
  // auth-js can remove the local session and still return a network/5xx error.
  const { data } = await supabase.auth.getSession()
  if (data.session) return error
  console.error('[useSignOut] sign-out error, local session cleared:', error)
  return null
}

export function useSignOut() {
  const signingOut = useRef(false)
  const [pending, setPending] = useState(false)

  function failSignOut(cause: unknown) {
    console.error('[useSignOut] sign-out failed:', cause)
    toast.error('Sign-out failed. Please try again.')
    signingOut.current = false
    setPending(false)
  }

  async function signOut() {
    if (signingOut.current) return
    signingOut.current = true
    setPending(true)
    try {
      const error = await signOutClient()
      if (error) return failSignOut(error)
    } catch (error) {
      if (isStaleDeploymentError(error) && reloadOnceForStaleDeployment()) return
      return failSignOut(error)
    }
    // Full document load: drops the signed-out user's client router cache.
    window.location.assign('/')
  }

  return { pending, signOut }
}
