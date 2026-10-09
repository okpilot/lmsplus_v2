'use client'

import { useNewVersionCheck } from '../_hooks/use-new-version-check'
import { useStaleChunkReload } from '../_hooks/use-stale-chunk-reload'
import { NewVersionBanner } from './new-version-banner'
import { NewVersionDialog } from './new-version-dialog'

export function NewVersionPrompt() {
  const { prompt, reload, later } = useNewVersionCheck()
  useStaleChunkReload()
  return (
    <>
      <NewVersionDialog open={prompt === 'dialog'} onReload={reload} onLater={later} />
      {prompt === 'banner' && <NewVersionBanner onReload={reload} />}
    </>
  )
}
