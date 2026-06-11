import { Input } from '@/components/ui/input'

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
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <span className="mb-1 block text-xs font-medium text-muted-foreground">Question #</span>
        <Input
          value={questionNumber}
          onChange={(e) => onQuestionNumberChange(e.target.value)}
          placeholder="e.g. MET-001"
          disabled={isPending}
        />
      </div>
      <div>
        <span className="mb-1 block text-xs font-medium text-muted-foreground">LO Reference</span>
        <Input
          value={loReference}
          onChange={(e) => onLoReferenceChange(e.target.value)}
          placeholder="e.g. LO 050 01 01 01"
          disabled={isPending}
        />
      </div>
    </div>
  )
}
