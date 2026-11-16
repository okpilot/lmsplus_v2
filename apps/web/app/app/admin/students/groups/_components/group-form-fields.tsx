import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

type Props = {
  name: string
  description: string
  disabled: boolean
  onNameChange: (value: string) => void
  onDescriptionChange: (value: string) => void
}

export function GroupFormFields({
  name,
  description,
  disabled,
  onNameChange,
  onDescriptionChange,
}: Readonly<Props>) {
  return (
    <div className="grid gap-4 py-2">
      <div className="grid gap-2">
        <Label htmlFor="group-name">Name</Label>
        <Input
          id="group-name"
          value={name}
          maxLength={80}
          disabled={disabled}
          onChange={(e) => onNameChange(e.target.value)}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="group-description">Description</Label>
        <Textarea
          id="group-description"
          value={description}
          maxLength={500}
          disabled={disabled}
          onChange={(e) => onDescriptionChange(e.target.value)}
        />
      </div>
    </div>
  )
}
