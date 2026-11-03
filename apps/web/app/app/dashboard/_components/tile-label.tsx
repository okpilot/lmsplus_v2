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
    <div className="flex items-center gap-1 text-caption sm:text-label">
      <span className="sm:hidden">{short}</span>
      <span className="hidden sm:inline">{full}</span>
      <InfoTooltip
        label={`What is ${full}?`}
        title={full}
        description={description}
        align={align}
      />
    </div>
  )
}
