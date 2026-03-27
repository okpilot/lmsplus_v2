import { Checkbox } from '@/components/ui/checkbox'

type ConsentCheckboxProps = {
  id: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled: boolean
  label: string
  linkHref: string
  linkText: string
  required?: boolean
  description?: string
}

export function ConsentCheckbox({
  id,
  checked,
  onCheckedChange,
  disabled,
  label,
  linkHref,
  linkText,
  required,
  description,
}: Readonly<ConsentCheckboxProps>) {
  return (
    <div className="flex items-start gap-3">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(c) => onCheckedChange(c === true)}
        disabled={disabled}
        aria-label={`${label} ${linkText}`}
      />
      <span className="text-sm leading-snug">
        {label}{' '}
        <a
          href={linkHref}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-4 hover:text-primary"
        >
          {linkText}
        </a>
        {required && <span className="text-destructive"> *</span>}
        {description && (
          <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
        )}
      </span>
    </div>
  )
}
