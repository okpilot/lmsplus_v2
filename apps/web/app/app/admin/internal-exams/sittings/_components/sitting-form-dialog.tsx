'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { FieldError } from '@/components/ui/field-error'
import { Input } from '@/components/ui/input'
import { LoadingButton } from '@/components/ui/loading-button'
import { Textarea } from '@/components/ui/textarea'
import { useSittingUi } from '../_hooks/sitting-ui-context'
import { createSitting } from '../actions/create-sitting'
import { updateSitting } from '../actions/update-sitting'
import { type InvigilatorOption, SITTING_BASE, type SittingRow } from '../types'
import { DialogShell } from './dialog-shell'
import { OptionSelect } from './option-select'
import { PopupBody, PopupFooter, PopupHeader } from './popup-parts'
import { isoToUtcInput, utcInputToIso } from './sitting-labels'

type Props =
  | { mode: 'new'; sitting?: undefined; invigilators: InvigilatorOption[] }
  | { mode: 'edit'; sitting: SittingRow; invigilators: InvigilatorOption[] }

const NO_INVIGILATOR = 'none'

function defaultWhen(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + 1)
  d.setUTCHours(9, 0, 0, 0)
  return d.toISOString().slice(0, 16)
}

export function SittingFormDialog({ sitting, invigilators }: Readonly<Props>) {
  return (
    <DialogShell>
      <SittingForm sitting={sitting} invigilators={invigilators} />
    </DialogShell>
  )
}

type Values = { mode: 'remote' | 'in_person'; invigilatorId: string; materials: string }

/** Create, or update (a started sitting sends the invigilator only). Returns an error message or null. */
async function persist(sitting: SittingRow | undefined, iso: string, v: Values) {
  if (sitting) {
    const locked = sitting.status !== 'scheduled'
    const r = await updateSitting({
      sittingId: sitting.id,
      ...(locked ? {} : { scheduledAt: iso, mode: v.mode, permittedMaterials: v.materials }),
      invigilatorId: v.invigilatorId,
    })
    return r.success ? { id: sitting.id } : { error: r.error }
  }
  const r = await createSitting({
    scheduledAt: iso,
    mode: v.mode,
    invigilatorId: v.invigilatorId,
    ...(v.materials.trim() ? { permittedMaterials: v.materials } : {}),
  })
  return r.success ? { id: r.sittingId } : { error: r.error }
}

function toIsoOrNull(value: string): string | null {
  try {
    return utcInputToIso(value)
  } catch {
    return null
  }
}

function useSittingForm(sitting: SittingRow | undefined) {
  const router = useRouter()
  const { close, setLocked, setBanner } = useSittingUi()
  const [pending, startTransition] = useTransition()
  const [when, setWhen] = useState(sitting ? isoToUtcInput(sitting.scheduledAt) : defaultWhen())
  const [mode, setMode] = useState<'remote' | 'in_person'>(sitting?.mode ?? 'remote')
  const [invigilatorId, setInvigilatorId] = useState(sitting?.invigilatorId ?? '')
  const [materials, setMaterials] = useState(sitting?.permittedMaterials ?? '')
  const [error, setError] = useState<string | null>(null)
  const iso = toIsoOrNull(when)
  const valid = iso !== null && invigilatorId !== ''
  const locked = sitting !== undefined && sitting.status !== 'scheduled'

  async function saveSitting(isoValue: string) {
    const r = await persist(sitting, isoValue, { mode, invigilatorId, materials })
    if (r.error !== undefined) return setError(r.error)
    if (sitting) {
      setBanner({ tone: 'success', title: 'Details saved.' })
      return close()
    }
    toast.success('Sitting created')
    router.replace(`${SITTING_BASE}/${r.id}`)
  }

  function submit() {
    if (!iso) return
    setError(null)
    setLocked(true)
    setBanner(null)
    startTransition(async () => {
      try {
        await saveSitting(iso)
      } catch {
        setError('Service error. Please try again.')
      } finally {
        setLocked(false)
      }
    })
  }

  return {
    pending,
    locked,
    valid,
    error,
    submit,
    close,
    fields: {
      when,
      setWhen,
      mode,
      setMode,
      invigilatorId,
      setInvigilatorId,
      materials,
      setMaterials,
    },
  }
}

function SittingForm({
  sitting,
  invigilators,
}: Readonly<{ sitting?: SittingRow; invigilators: InvigilatorOption[] }>) {
  const { pending, locked, valid, error, submit, close, fields: f } = useSittingForm(sitting)
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
            ...invigilators.map((i) => ({ value: i.id, label: i.name })),
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
      <PopupFooter>
        <Button variant="outline" disabled={pending} onClick={close}>
          Cancel
        </Button>
        <LoadingButton onClick={submit} loading={pending} disabled={!valid} loadingText="Saving...">
          Save
        </LoadingButton>
      </PopupFooter>
    </>
  )
}
