import { Checkbox } from '@/components/ui/checkbox'
import { Link } from '@/components/ui/link'

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
        aria-required={required}
        aria-label={`${label} ${linkText}`}
      />
      <label htmlFor={id} className="text-body cursor-pointer">
        {label}{' '}
        <Link
          href={linkHref}
          target="_blank"
          rel="noopener noreferrer"
          tone="inherit"
          onClick={(e) => e.stopPropagation()}
        >
          {linkText}
        </Link>
        {description && (
          <span className="mt-0.5 block text-caption text-muted-foreground">{description}</span>
        )}
      </label>
    </div>
  )
}
