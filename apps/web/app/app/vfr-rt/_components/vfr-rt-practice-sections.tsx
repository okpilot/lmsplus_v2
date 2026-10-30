import { BlockedStartAlert } from '@/app/app/quiz/_components/blocked-start-alert'
import { QuestionCount } from '@/app/app/quiz/_components/question-count'
import type { useQuizConfig } from '@/app/app/quiz/_hooks/use-quiz-config'
import { Card, CardContent } from '@/components/ui/card'
import { FieldError } from '@/components/ui/field-error'

type VfrRtPracticeSectionsProps = {
  config: ReturnType<typeof useQuizConfig>
}

type Config = ReturnType<typeof useQuizConfig>

function CountSection({ config }: Readonly<{ config: Config }>) {
  return (
    <Card>
      <CardContent>
        <QuestionCount
          value={config.count}
          max={config.availableCount}
          onValueChange={config.setCount}
        />
      </CardContent>
    </Card>
  )
}

function ConfigErrors({ config }: Readonly<{ config: Config }>) {
  return (
    <>
      <BlockedStartAlert message={config.error} blocked={config.blocked} startLabel="quiz" />
      {config.authError && (
        <FieldError role="alert">Session expired. Please refresh the page.</FieldError>
      )}
    </>
  )
}

/** Question count and errors for a Practice (non-exam) VFR RT run; the Start button follows in the form. */
export function VfrRtPracticeSections({ config }: Readonly<VfrRtPracticeSectionsProps>) {
  return (
    <>
      {config.topicTree.topics.length > 0 && <CountSection config={config} />}
      <ConfigErrors config={config} />
    </>
  )
}
