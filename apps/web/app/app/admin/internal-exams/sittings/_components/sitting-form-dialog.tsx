'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { FieldError } from '@/components/ui/field-error'
import { Input } from '@/components/ui/input'
import { LoadingButton } from '@/components/ui/loading-button'
import { Textarea } from '@/components/ui/textarea'
import { useSittingUi } from '../_hooks/sitting-ui-context'
import { defaultWhen, persist, toIsoOrNull } from '../_utils/sitting-form'
import { type InvigilatorOption, SITTING_BASE, type SittingRow } from '../types'
import { DialogShell } from './dialog-shell'
import { OptionSelect } from './option-select'
import { PopupBody, PopupFooter, PopupHeader } from './popup-parts'
import { isoToUtcInput } from './sitting-labels'

type Props =
  | { mode: 'new'; sitting?: undefined; invigilators: InvigilatorOption[] }
  | { mode: 'edit'; sitting: SittingRow; invigilators: InvigilatorOption[] }

const NO_INVIGILATOR = 'none'

export function SittingFormDialog({ sitting, invigilators }: Readonly<Props>) {
  return (
    <DialogShell>
      <SittingForm sitting={sitting} invigilators={invigilators} />
    </DialogShell>
  )
}

function useFormFields(sitting: SittingRow | undefined) {
  const [when, setWhen] = useState(sitting ? isoToUtcInput(sitting.scheduledAt) : defaultWhen())
  const [mode, setMode] = useState<'remote' | 'in_person'>(sitting?.mode ?? 'remote')
  const [invigilatorId, setInvigilatorId] = useState(sitting?.invigilatorId ?? '')
  const [materials, setMaterials] = useState(sitting?.permittedMaterials ?? '')
  return { when, setWhen, mode, setMode, invigilatorId, setInvigilatorId, materials, setMaterials }
}

/** Drop `dlg` from the current history entry so Back from the new sitting lands on the list. */
function dropDialogParam() {
  const url = new URL(window.location.href)
  url.searchParams.delete('dlg')
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
}

function useSittingForm(sitting: SittingRow | undefined) {
  const router = useRouter()
  const { close, setLocked, setBanner } = useSittingUi()
  const [pending, startTransition] = useTransition()
  const fields = useFormFields(sitting)
  const { when, mode, invigilatorId, materials } = fields
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState(false)
  const iso = toIsoOrNull(when)
  const valid = iso !== null && invigilatorId !== ''
  const locked = sitting !== undefined && sitting.status !== 'scheduled'

  // A created sitting navigates away: stay locked (no second Save, no dismiss) until unmount.
  useEffect(() => () => setLocked(false), [setLocked])

  /** Returns true after a create: the page navigates away and the form stays locked. */
  async function saveSitting(isoValue: string): Promise<boolean> {
    const r = await persist(sitting, isoValue, { when, mode, invigilatorId, materials })
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
    dropDialogParam()
    router.push(`${SITTING_BASE}/${r.id}`)
    return true
  }

  function submit() {
    if (!iso) return
    setError(null)
    setLocked(true)
    setBanner(null)
    startTransition(async () => {
      let stays = false
      try {
        stays = await saveSitting(iso)
      } catch {
        setError('Service error. Please try again.')
      } finally {
        if (!stays) setLocked(false)
      }
    })
  }

  return { pending, locked, created, valid, error, submit, close, fields }
}

/** The assigned invigilator stays selectable when no longer active. */
function withAssignedInvigilator(
  sitting: SittingRow | undefined,
  invigilators: InvigilatorOption[],
) {
  if (!sitting || invigilators.some((i) => i.id === sitting.invigilatorId)) return invigilators
  return [
    { id: sitting.invigilatorId, name: `${sitting.invigilatorName} (inactive)` },
    ...invigilators,
  ]
}

type FooterProps = {
  pending: boolean
  created: boolean
  valid: boolean
  close: () => void
  submit: () => void
}

function FormFooter({ pending, created, valid, close, submit }: Readonly<FooterProps>) {
  return (
    <PopupFooter>
      <Button variant="outline" disabled={pending || created} onClick={close}>
        Cancel
      </Button>
      <LoadingButton
        onClick={submit}
        loading={pending}
        disabled={!valid || created}
        loadingText="Saving..."
      >
        Save
      </LoadingButton>
    </PopupFooter>
  )
}

function SittingForm({
  sitting,
  invigilators,
}: Readonly<{ sitting?: SittingRow; invigilators: InvigilatorOption[] }>) {
  const { pending, locked, error, fields: f, ...footer } = useSittingForm(sitting)
  const options = withAssignedInvigilator(sitting, invigilators)
  return (
    <>
      <PopupHeader>
        <DialogTitle>{sitting ? 'Edit sitting' : 'New sitting'}</DialogTitle>
        <DialogDescription>
          Details only. A sitting lasts one day and closes at 23:59 UTC.
        </DialogDescription>
      </PopupHeader>
      <PopupBody>
        <label htmlFor="sitting-when" className="block space-y-1 text-label text-muted-foreground">
          Date and time (UTC)
          <Input
            id="sitting-when"
            type="datetime-local"
            value={f.when}
            disabled={pending || locked}
            className="min-w-0"
            onChange={(e) => f.setWhen(e.target.value)}
          />
        </label>
        <OptionSelect
          label="Mode"
          value={f.mode}
          disabled={pending || locked}
          options={[
            { value: 'remote', label: 'Remote' },
            { value: 'in_person', label: 'In person' },
          ]}
          onChange={(v) => f.setMode(v === 'in_person' ? 'in_person' : 'remote')}
        />
        <OptionSelect
          label="Invigilator"
          value={f.invigilatorId || NO_INVIGILATOR}
          disabled={pending}
          options={[
            { value: NO_INVIGILATOR, label: 'Select an invigilator' },
            ...options.map((i) => ({ value: i.id, label: i.name })),
          ]}
          onChange={(v) => f.setInvigilatorId(v === NO_INVIGILATOR ? '' : v)}
        />
        <label
          htmlFor="sitting-materials"
          className="block space-y-1 text-label text-muted-foreground"
        >
          Permitted materials (optional)
          <Textarea
            id="sitting-materials"
            value={f.materials}
            maxLength={1000}
            disabled={pending || locked}
            className="min-w-0"
            onChange={(e) => f.setMaterials(e.target.value)}
          />
        </label>
        {locked && (
          <p className="text-caption text-muted-foreground">
            Locked once open: time, mode and materials. The invigilator can still be changed.
          </p>
        )}
        <FieldError role="alert">{error}</FieldError>
      </PopupBody>
      <FormFooter pending={pending} {...footer} />
    </>
  )
}
