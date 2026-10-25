'use client'

import { useUser } from './user-context'

/** Reading the shell-user promise surfaces `loadShellUser`'s sign-out redirect on every `/app` route, fullscreen included. */
export function ActiveUserGate() {
  useUser()
  return null
}
