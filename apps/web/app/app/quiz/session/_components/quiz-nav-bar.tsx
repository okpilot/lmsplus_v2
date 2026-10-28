import { Button } from '@/components/ui/button'

type QuizNavBarProps = {
  currentIndex: number
  totalQuestions: number
  onPrev: () => void
  onNext: () => void
}

export function QuizNavBar({
  currentIndex,
  totalQuestions,
  onPrev,
  onNext,
}: Readonly<QuizNavBarProps>) {
  return (
    <>
      <Button variant="outline" type="button" onClick={onPrev} disabled={currentIndex === 0}>
        &lt; Previous
      </Button>
      <Button
        variant="outline"
        type="button"
        onClick={onNext}
        disabled={currentIndex === totalQuestions - 1}
      >
        Next &gt;
      </Button>
    </>
  )
}
