import { InfoTooltip } from './info-tooltip'

export function TileLabel({
  short,
  full,
  description,
  align,
}: Readonly<{
  short: string
  full: string
  description: string
  align?: 'left' | 'center' | 'right'
}>) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="md:hidden">{short}</span>
      <span className="hidden md:inline">{full}</span>
      <InfoTooltip
        label={`What is ${full}?`}
        title={full}
        description={description}
        align={align}
      />
    </span>
  )
}
