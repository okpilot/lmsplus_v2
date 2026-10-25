import type { MergeDeep } from 'type-fest'
import type { Database as DatabaseGenerated } from './types'

type NullableScopes = { Args: { p_topic_ids: string[] | null; p_subtopic_ids: string[] | null } }

// SQL args without DEFAULT that accept NULL.
export type Database = MergeDeep<
  DatabaseGenerated,
  {
    public: {
      Functions: {
        start_practice_quiz: NullableScopes
        start_discovery: NullableScopes
        get_filtered_question_counts: NullableScopes
        start_quiz_session: { Args: { p_subject_id: string | null; p_topic_id: string | null } }
      }
    }
  }
>
