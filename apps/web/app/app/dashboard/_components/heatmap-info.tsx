import { InfoTooltip } from './info-tooltip'

export function HeatmapInfo() {
  return (
    <InfoTooltip
      label="What does this chart show?"
      title="Daily Progress"
      description="Each cell shows three numbers: total questions answered (blue, top), correct answers (green, middle), and wrong answers (red, bottom). Use the arrows to switch months."
      align="left"
    />
  )
}
