const MODE_LABEL = { remote: 'Remote', in_person: 'In person' } as const

export type SittingMode = keyof typeof MODE_LABEL

export function sittingModeLabel(mode: SittingMode): string {
  return MODE_LABEL[mode]
}
