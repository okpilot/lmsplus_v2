'use client'

import { useRouter } from 'next/navigation'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

type Props = {
  sessionId: string
}

export function ExpiredExamNotice({ sessionId }: Readonly<Props>) {
  const router = useRouter()

  function handleViewResults() {
    router.push(`/app/quiz/report?session=${sessionId}`)
  }

  return (
    <Alert tone="caution" layout="row">
      <AlertTitle>Practice Exam expired</AlertTitle>
      <AlertDescription>Your exam time has ended. View your results below.</AlertDescription>
      <AlertAction className="flex gap-2">
        <Button type="button" variant="caution" onClick={handleViewResults}>
          View Results
        </Button>
      </AlertAction>
    </Alert>
  )
}
