type StatisticsTabProps = {
  questionId: string
  hasAnswered: boolean
}

export function StatisticsTab({ hasAnswered }: StatisticsTabProps) {
  if (!hasAnswered) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        Answer the question to see your statistics.
      </div>
    )
  }

  return (
    <div className="py-8 text-center text-sm text-muted-foreground">
      Statistics will be available soon.
    </div>
  )
}
