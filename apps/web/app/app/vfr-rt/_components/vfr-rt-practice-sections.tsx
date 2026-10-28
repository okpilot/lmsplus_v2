import { BlockedStartAlert } from '@/app/app/quiz/_components/blocked-start-alert'
import { QuestionCount } from '@/app/app/quiz/_components/question-count'
import { StartButton } from '@/app/app/quiz/_components/start-button'
import { TopicTree } from '@/app/app/quiz/_components/topic-tree'
import type { useQuizConfig } from '@/app/app/quiz/_hooks/use-quiz-config'
import { Card, CardContent } from '@/components/ui/card'
import { FieldError } from '@/components/ui/field-error'

type VfrRtPracticeSectionsProps = {
  config: ReturnType<typeof useQuizConfig>
}

type Config = ReturnType<typeof useQuizConfig>

function TopicSection({ config }: Readonly<{ config: Config }>) {
  const t = config.topicTree
  return (
    <>
      <Card>
        <CardContent>
          <TopicTree
            topics={t.topics}
            checkedTopics={t.checkedTopics}
            checkedSubtopics={t.checkedSubtopics}
            onToggleTopic={t.toggleTopic}
            onToggleSubtopic={t.toggleSubtopic}
            onSelectAll={t.selectAll}
            totalQuestions={t.totalQuestions}
            allSelected={t.allSelected}
            filteredByTopic={config.filteredByTopic}
            filteredBySubtopic={config.filteredBySubtopic}
            showCode={false}
          />
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <QuestionCount
            value={config.count}
            max={config.availableCount}
            onValueChange={config.setCount}
          />
        </CardContent>
      </Card>
    </>
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

/** Topic tree, question count, errors and start button for a Practice (non-exam) VFR RT run. */
export function VfrRtPracticeSections({ config }: Readonly<VfrRtPracticeSectionsProps>) {
  const disabled =
    config.availableCount === 0 || config.loading || config.isPending || config.authError
  return (
    <>
      {config.topicTree.topics.length > 0 && <TopicSection config={config} />}
      <ConfigErrors config={config} />
      <StartButton
        disabled={disabled}
        loading={config.loading}
        label="Start Practice"
        onClick={config.handleStart}
      />
    </>
  )
}
