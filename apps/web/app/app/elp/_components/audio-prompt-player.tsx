type AudioPromptPlayerProps = {
  src: string
  label?: string
}

/** Plays a pre-recorded §1 interview prompt. Presentational only — no logic. */
export function AudioPromptPlayer({ src, label }: Readonly<AudioPromptPlayerProps>) {
  return (
    <div className="space-y-2">
      {label && <p className="text-sm font-medium text-muted-foreground">{label}</p>}
      {/* biome-ignore lint/a11y/useMediaCaption: spoken prompt audio, no caption track available */}
      <audio controls src={src} aria-label={label ?? 'Interview prompt audio'} className="w-full" />
    </div>
  )
}
