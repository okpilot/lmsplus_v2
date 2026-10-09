'use client'

import { useNewVersionCheck } from '../_hooks/use-new-version-check'
import { useStaleChunkReload } from '../_hooks/use-stale-chunk-reload'

export function NewVersionPrompt() {
  useNewVersionCheck()
  useStaleChunkReload()
  return null
}
