import { QuestionCount } from '@/app/app/quiz/_components/question-count'
import { StartButton } from '@/app/app/quiz/_components/start-button'
import { TopicTree } from '@/app/app/quiz/_components/topic-tree'
import type { useQuizConfig } from '@/app/app/quiz/_hooks/use-quiz-config'

type VfrRtPracticeSectionsProps = {
  config: ReturnType<typeof useQuizConfig>
}

/** Topic tree, question count, errors and start button for a Practice (non-exam) VFR RT run. */
export function VfrRtPracticeSections({ config }: Readonly<VfrRtPracticeSectionsProps>) {
  const hasTopics = config.topicTree.topics.length > 0
  return (
    <>
      {hasTopics && (
        <>
          <div className="rounded-xl border border-border bg-card p-6">
            <TopicTree
              topics={config.topicTree.topics}
              checkedTopics={config.topicTree.checkedTopics}
              checkedSubtopics={config.topicTree.checkedSubtopics}
              onToggleTopic={config.topicTree.toggleTopic}
              onToggleSubtopic={config.topicTree.toggleSubtopic}
              onSelectAll={config.topicTree.selectAll}
              totalQuestions={config.topicTree.totalQuestions}
              allSelected={config.topicTree.allSelected}
              filteredByTopic={config.filteredByTopic}
              filteredBySubtopic={config.filteredBySubtopic}
              showCode={false}
            />
          </div>
          <div className="rounded-xl border border-border bg-card p-6">
            <QuestionCount
              value={config.count}
              max={config.availableCount}
              onValueChange={config.setCount}
            />
          </div>
        </>
      )}

      {config.error && (
        <p role="alert" className="text-sm text-destructive">
          {config.error}
        </p>
      )}
      {config.authError && (
        <p role="alert" className="text-sm text-destructive">
          Session expired. Please refresh the page.
        </p>
      )}

      <StartButton
        disabled={
          config.availableCount === 0 || config.loading || config.isPending || config.authError
        }
        loading={config.loading}
        label="Start Practice"
        onClick={config.handleStart}
      />
    </>
  )
}
