type Props = Readonly<{ message: string }>

export function ContentErrorFallback({ message }: Props) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
      {message}
    </div>
  )
}
