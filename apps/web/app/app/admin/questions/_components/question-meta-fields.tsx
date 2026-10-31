import { useId } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Props = {
  questionNumber: string
  loReference: string
  isPending: boolean
  onQuestionNumberChange: (v: string) => void
  onLoReferenceChange: (v: string) => void
}

export function QuestionMetaFields({
  questionNumber,
  loReference,
  isPending,
  onQuestionNumberChange,
  onLoReferenceChange,
}: Readonly<Props>) {
  const numberId = useId()
  const loId = useId()
  return (
    <div className="grid grid-cols-2 gap-stack-lg">
      <div>
        <Label htmlFor={numberId} className="mb-1 block">
          Question # (optional)
        </Label>
        <Input
          id={numberId}
          value={questionNumber}
          onChange={(e) => onQuestionNumberChange(e.target.value)}
          placeholder="e.g. MET-001"
          disabled={isPending}
        />
      </div>
      <div>
        <Label htmlFor={loId} className="mb-1 block">
          LO Reference (optional)
        </Label>
        <Input
          id={loId}
          value={loReference}
          onChange={(e) => onLoReferenceChange(e.target.value)}
          placeholder="e.g. LO 050 01 01 01"
          disabled={isPending}
        />
      </div>
    </div>
  )
}
