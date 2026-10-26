import type { MergeDeep } from 'type-fest'
import type { Database as DatabaseGenerated } from './types'

type Functions = DatabaseGenerated['public']['Functions']

// A: args without SQL DEFAULT (required in the generated type).
type NullableArgs<F extends keyof Functions, A extends keyof Functions[F]['Args']> = {
  Args: { [K in A]: Functions[F]['Args'][K] | null }
}

// SQL args without DEFAULT that accept NULL.
export type Database = MergeDeep<
  DatabaseGenerated,
  {
    public: {
      Functions: {
        start_practice_quiz: NullableArgs<'start_practice_quiz', 'p_topic_ids' | 'p_subtopic_ids'>
        start_discovery: NullableArgs<'start_discovery', 'p_topic_ids' | 'p_subtopic_ids'>
        get_filtered_question_counts: NullableArgs<
          'get_filtered_question_counts',
          'p_topic_ids' | 'p_subtopic_ids'
        >
        start_quiz_session: NullableArgs<'start_quiz_session', 'p_subject_id' | 'p_topic_id'>
      }
    }
  }
>
