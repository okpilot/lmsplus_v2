'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { isoToUtcInput } from '../_components/sitting-labels'
import type { SittingFormValues } from '../_utils/edit-changes'
import { defaultWhen, persist, toIsoOrNull } from '../_utils/sitting-form'
import { SITTING_BASE, type SittingRow } from '../types'
import { useSittingUi } from './sitting-ui-context'

function useFormFields(sitting: SittingRow | undefined) {
  const [when, setWhen] = useState(sitting ? isoToUtcInput(sitting.scheduledAt) : defaultWhen())
  const [mode, setMode] = useState<'remote' | 'in_person'>(sitting?.mode ?? 'remote')
  const [invigilatorId, setInvigilatorId] = useState(sitting?.invigilatorId ?? '')
  const [materials, setMaterials] = useState(sitting?.permittedMaterials ?? '')
  return { when, setWhen, mode, setMode, invigilatorId, setInvigilatorId, materials, setMaterials }
}

export type SittingFormFields = ReturnType<typeof useFormFields>

/** Drop `dlg` from the current history entry so Back from the new sitting lands on the list. */
export function dropDialogParam() {
  const url = new URL(window.location.href)
  url.searchParams.delete('dlg')
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
}

/** Opened here: replace the dialog entry (history [list, sitting]). Deep link: strip `dlg`, then push. */
function goToSitting(router: ReturnType<typeof useRouter>, id: string, openedHere: boolean) {
  const href = `${SITTING_BASE}/${id}`
  if (openedHere) {
    router.replace(href)
    return
  }
  dropDialogParam()
  router.push(href)
}

type Setters = { setError: (e: string | null) => void; setCreated: (c: boolean) => void }

/** Returns a saver that resolves true after a create: the page navigates away and the form stays locked. */
function useSaveSitting(
  sitting: SittingRow | undefined,
  values: SittingFormValues,
  { setError, setCreated }: Setters,
) {
  const router = useRouter()
  const { close, setBanner, consumeOpenedHere } = useSittingUi()
  return async (iso: string): Promise<boolean> => {
    const r = await persist(sitting, iso, values)
    if (r.error !== undefined) {
      setError(r.error)
      return false
    }
    if (r.id === null || sitting) {
      if (r.id !== null) setBanner({ tone: 'success', title: 'Details saved.' })
      close()
      return false
    }
    setCreated(true)
    toast.success('Sitting created')
    goToSitting(router, r.id, consumeOpenedHere())
    return true
  }
}

async function runLocked(
  save: () => Promise<boolean>,
  setError: (e: string | null) => void,
  setLocked: (v: boolean) => void,
) {
  let stays = false
  try {
    stays = await save()
  } catch {
    setError('Service error. Please try again.')
  } finally {
    if (!stays) setLocked(false)
  }
}

export function useSittingForm(sitting: SittingRow | undefined) {
  const { close, setLocked, setBanner } = useSittingUi()
  const [pending, startTransition] = useTransition()
  const fields = useFormFields(sitting)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState(false)
  const save = useSaveSitting(sitting, fields, { setError, setCreated })
  const iso = toIsoOrNull(fields.when)
  const valid = iso !== null && fields.invigilatorId !== ''
  const locked = sitting !== undefined && sitting.status !== 'scheduled'

  // A created sitting navigates away: stay locked (no second Save, no dismiss) until unmount.
  useEffect(() => () => setLocked(false), [setLocked])

  function submit() {
    if (!iso) return
    setError(null)
    setLocked(true)
    setBanner(null)
    startTransition(() => runLocked(() => save(iso), setError, setLocked))
  }

  return { pending, locked, created, valid, error, submit, close, fields }
}
