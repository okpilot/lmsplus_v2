import { Check, X } from 'lucide-react'

type Option = { id: string; text: string }

type OptionsListProps = {
  options: Option[]
  correctOptionId: string
  selectedOptionId: string | null
}

export function OptionsList({
  options,
  correctOptionId,
  selectedOptionId,
}: Readonly<OptionsListProps>) {
  if (options.length === 0) return null

  return (
    <ul className="mt-1 space-y-0.5">
      {options.map((option, i) => {
        const letter = String.fromCodePoint(65 + i)
        const isCorrect = option.id === correctOptionId
        const isSelected = option.id === selectedOptionId

        let rowClass = 'text-caption text-muted-foreground'
        if (isCorrect) rowClass = 'text-caption text-success'
        else if (isSelected) rowClass = 'text-caption text-danger'

        return (
          <li key={option.id} className={`flex items-center gap-1 ${rowClass}`}>
            <span className="font-medium">{letter}</span>
            <span>—</span>
            <span>{option.text}</span>
            {isCorrect && (
              <>
                <Check size={12} aria-hidden className="ml-1 shrink-0" />
                <span>Correct</span>
              </>
            )}
            {isSelected && !isCorrect && (
              <>
                <X size={12} aria-hidden className="ml-1 shrink-0" />
                <span>Your answer</span>
              </>
            )}
            {isCorrect && isSelected && <span>· Your answer</span>}
          </li>
        )
      })}
    </ul>
  )
}
