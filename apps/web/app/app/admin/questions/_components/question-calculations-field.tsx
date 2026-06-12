import { Checkbox } from '@/components/ui/checkbox'

type Props = {
  hasCalculations: boolean
  isPending: boolean
  onHasCalculationsChange: (v: boolean) => void
}

export function QuestionCalculationsField({
  hasCalculations,
  isPending,
  onHasCalculationsChange,
}: Readonly<Props>) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Checkbox
        id="question-has-calculations"
        checked={hasCalculations}
        onCheckedChange={(c) => onHasCalculationsChange(c === true)}
        disabled={isPending}
      />
      <label htmlFor="question-has-calculations" className="cursor-pointer">
        Calculation question
      </label>
    </div>
  )
}
