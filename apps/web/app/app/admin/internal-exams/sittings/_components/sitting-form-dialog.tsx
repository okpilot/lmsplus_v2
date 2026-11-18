'use client'

import { Button } from '@/components/ui/button'
import { DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { FieldError } from '@/components/ui/field-error'
import { LoadingButton } from '@/components/ui/loading-button'
import { useSittingForm } from '../_hooks/use-sitting-form'
import type { InvigilatorOption, SittingRow } from '../types'
import { DialogShell } from './dialog-shell'
import { PopupBody, PopupFooter, PopupHeader } from './popup-parts'
import { SittingFormFields } from './sitting-form-fields'

type Props =
  | { mode: 'new'; sitting?: undefined; invigilators: InvigilatorOption[] }
  | { mode: 'edit'; sitting: SittingRow; invigilators: InvigilatorOption[] }

export function SittingFormDialog({ sitting, invigilators }: Readonly<Props>) {
  return (
    <DialogShell>
      <SittingForm sitting={sitting} invigilators={invigilators} />
    </DialogShell>
  )
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
  const { pending, locked, error, fields, ...footer } = useSittingForm(sitting)
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
        <SittingFormFields
          fields={fields}
          invigilators={options}
          pending={pending}
          locked={locked}
        />
        {locked && (
          <p className="text-caption text-muted-foreground">
            Locked once open: time and mode. The invigilator can still be changed.
          </p>
        )}
        <FieldError role="alert">{error}</FieldError>
      </PopupBody>
      <FormFooter pending={pending} {...footer} />
    </>
  )
}
