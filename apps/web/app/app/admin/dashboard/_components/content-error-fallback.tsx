import { Alert, AlertDescription } from '@/components/ui/alert'

type Props = Readonly<{ message: string }>

export function ContentErrorFallback({ message }: Readonly<Props>) {
  return (
    <Alert tone="neutral">
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}
