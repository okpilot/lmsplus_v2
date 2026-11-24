import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { SittingFormFields as Fields } from '../_hooks/use-sitting-form'
import type { InvigilatorOption } from '../types'
import { OptionSelect } from './option-select'

const NO_INVIGILATOR = 'none'

type Props = {
  fields: Fields
  invigilators: InvigilatorOption[]
  pending: boolean
  locked: boolean
}

const MODE_OPTIONS = [
  { value: 'remote', label: 'Remote' },
  { value: 'in_person', label: 'In person' },
]

export function SittingFormFields({ fields: f, invigilators, pending, locked }: Readonly<Props>) {
  const off = pending || locked
  return (
    <>
      <label htmlFor="sitting-when" className="block space-y-1 text-label text-muted-foreground">
        Date and time (UTC)
        <Input
          id="sitting-when"
          type="datetime-local"
          value={f.when}
          disabled={off}
          className="min-w-0"
          onChange={(e) => f.setWhen(e.target.value)}
        />
      </label>
      <OptionSelect
        label="Mode"
        value={f.mode}
        disabled={off}
        options={MODE_OPTIONS}
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
          disabled={off}
          className="min-w-0"
          onChange={(e) => f.setMaterials(e.target.value)}
        />
      </label>
    </>
  )
}
