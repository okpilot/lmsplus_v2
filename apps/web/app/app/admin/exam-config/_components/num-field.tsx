'use client'

const inputCls = 'w-full rounded border border-border bg-background px-3 py-2 text-sm'
const labelCls = 'mb-1 block text-xs font-medium text-muted-foreground'

export function NumField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
}) {
  return (
    <div>
      <label className={labelCls}>
        {label}
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className={inputCls}
        />
      </label>
    </div>
  )
}
