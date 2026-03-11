import {
  type CardInput,
  type Grade,
  Rating,
  type RecordLogItem,
  State,
  createEmptyCard,
  fsrs,
  generatorParameters,
} from 'ts-fsrs'

const params = generatorParameters({ enable_fuzz: true })
const scheduler = fsrs(params)

export { Rating, State, createEmptyCard }
export type { Grade }

/** Map a boolean answer result to an FSRS Grade */
export function ratingFromAnswer(isCorrect: boolean): Grade {
  return isCorrect ? Rating.Good : Rating.Again
}

/** Schedule the next review for a card after a grade */
export function scheduleCard(card: CardInput, grade: Grade): RecordLogItem {
  const now = new Date()
  return scheduler.next(card, now, grade)
}

/** Convert a DB fsrs_cards row to a ts-fsrs CardInput object */
export function dbRowToCard(row: {
  due: string
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  reps: number
  lapses: number
  state: string
  last_review: string | null
}): CardInput {
  return {
    due: new Date(row.due),
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsed_days,
    scheduled_days: row.scheduled_days,
    learning_steps: 0,
    reps: row.reps,
    lapses: row.lapses,
    state: stateFromString(row.state),
    last_review: row.last_review ? new Date(row.last_review) : undefined,
  }
}

function stateFromString(s: string): State {
  switch (s) {
    case 'learning':
      return State.Learning
    case 'review':
      return State.Review
    case 'relearning':
      return State.Relearning
    default:
      return State.New
  }
}

/** Convert a ts-fsrs State enum back to the DB string value */
export function stateToString(s: State): string {
  switch (s) {
    case State.Learning:
      return 'learning'
    case State.Review:
      return 'review'
    case State.Relearning:
      return 'relearning'
    default:
      return 'new'
  }
}
