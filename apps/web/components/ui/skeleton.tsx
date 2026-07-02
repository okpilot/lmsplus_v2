function Skeleton({ className, ...props }: Readonly<React.ComponentProps<'div'>>) {
  return <div className={`animate-pulse rounded-md bg-muted ${className ?? ''}`} {...props} />
}

export { Skeleton }
