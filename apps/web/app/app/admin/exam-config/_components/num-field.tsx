'use client'

import { useId } from 'react'
import { Input } from '@/components/ui/input'

const labelCls = 'mb-1 block text-label text-muted-foreground'

export function NumField({
  label,
  value,
  min,
  max,
  onChange,
}: Readonly<{
  label: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
}>) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="block">
        <span className={labelCls}>{label}</span>
        <Input
          id={id}
          type="number"
          size="default"
          min={min}
          max={max}
          value={value}
          onChange={(e) => {
            const v = e.target.valueAsNumber
            if (Number.isNaN(v)) return
            onChange(Math.max(min, Math.min(max, v)))
          }}
        />
      </label>
    </div>
  )
}
