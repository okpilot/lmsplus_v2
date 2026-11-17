/** "N question(s)" caption used by syllabus rows. */
export function QuestionCount({ count }: Readonly<{ count: number }>) {
  return (
    <span className="text-caption text-muted-foreground tabular-nums">
      {count} {count === 1 ? 'question' : 'questions'}
    </span>
  )
}
