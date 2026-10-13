import { Empty, EmptyDescription } from '@/components/ui/empty'

export function EmptyNote({ children }: Readonly<{ children: string }>) {
  return (
    <Empty>
      <EmptyDescription>{children}</EmptyDescription>
    </Empty>
  )
}
