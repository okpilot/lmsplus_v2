export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.1'
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      audit_events: {
        Row: {
          actor_id: string
          actor_role: string
          created_at: string
          event_type: string
          id: string
          ip_address: unknown
          metadata: Json
          organization_id: string
          resource_id: string | null
          resource_type: string
        }
        Insert: {
          actor_id: string
          actor_role: string
          created_at?: string
          event_type: string
          id?: string
          ip_address?: unknown
          metadata?: Json
          organization_id: string
          resource_id?: string | null
          resource_type: string
        }
        Update: {
          actor_id?: string
          actor_role?: string
          created_at?: string
          event_type?: string
          id?: string
          ip_address?: unknown
          metadata?: Json
          organization_id?: string
          resource_id?: string | null
          resource_type?: string
        }
        Relationships: [
          {
            foreignKeyName: 'audit_events_actor_id_fkey'
            columns: ['actor_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'audit_events_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      courses: {
        Row: {
          created_at: string
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          id: string
          organization_id: string
          status: string
          subject: string
          title: string
        }
        Insert: {
          created_at?: string
          created_by: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          organization_id: string
          status?: string
          subject: string
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          organization_id?: string
          status?: string
          subject?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: 'courses_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'courses_deleted_by_fkey'
            columns: ['deleted_by']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'courses_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      easa_subjects: {
        Row: {
          code: string
          id: string
          name: string
          short: string
          sort_order: number
        }
        Insert: {
          code: string
          id?: string
          name: string
          short: string
          sort_order: number
        }
        Update: {
          code?: string
          id?: string
          name?: string
          short?: string
          sort_order?: number
        }
        Relationships: []
      }
      easa_subtopics: {
        Row: {
          code: string
          id: string
          name: string
          sort_order: number
          topic_id: string
        }
        Insert: {
          code: string
          id?: string
          name: string
          sort_order: number
          topic_id: string
        }
        Update: {
          code?: string
          id?: string
          name?: string
          sort_order?: number
          topic_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'easa_subtopics_topic_id_fkey'
            columns: ['topic_id']
            isOneToOne: false
            referencedRelation: 'easa_topics'
            referencedColumns: ['id']
          },
        ]
      }
      easa_topics: {
        Row: {
          code: string
          id: string
          name: string
          sort_order: number
          subject_id: string
        }
        Insert: {
          code: string
          id?: string
          name: string
          sort_order: number
          subject_id: string
        }
        Update: {
          code?: string
          id?: string
          name?: string
          sort_order?: number
          subject_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'easa_topics_subject_id_fkey'
            columns: ['subject_id']
            isOneToOne: false
            referencedRelation: 'easa_subjects'
            referencedColumns: ['id']
          },
        ]
      }
      flagged_questions: {
        Row: {
          deleted_at: string | null
          flagged_at: string
          question_id: string
          student_id: string
        }
        Insert: {
          deleted_at?: string | null
          flagged_at?: string
          question_id: string
          student_id: string
        }
        Update: {
          deleted_at?: string | null
          flagged_at?: string
          question_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'flagged_questions_question_id_fkey'
            columns: ['question_id']
            isOneToOne: false
            referencedRelation: 'questions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'flagged_questions_student_id_fkey'
            columns: ['student_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      fsrs_cards: {
        Row: {
          consecutive_correct_count: number
          difficulty: number
          due: string
          elapsed_days: number
          id: string
          lapses: number
          last_review: string | null
          last_was_correct: boolean
          question_id: string
          reps: number
          scheduled_days: number
          stability: number
          state: string
          student_id: string
          updated_at: string
        }
        Insert: {
          consecutive_correct_count?: number
          difficulty?: number
          due?: string
          elapsed_days?: number
          id?: string
          lapses?: number
          last_review?: string | null
          last_was_correct?: boolean
          question_id: string
          reps?: number
          scheduled_days?: number
          stability?: number
          state?: string
          student_id: string
          updated_at?: string
        }
        Update: {
          consecutive_correct_count?: number
          difficulty?: number
          due?: string
          elapsed_days?: number
          id?: string
          lapses?: number
          last_review?: string | null
          last_was_correct?: boolean
          question_id?: string
          reps?: number
          scheduled_days?: number
          stability?: number
          state?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'fsrs_cards_question_id_fkey'
            columns: ['question_id']
            isOneToOne: false
            referencedRelation: 'questions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'fsrs_cards_student_id_fkey'
            columns: ['student_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      lessons: {
        Row: {
          content: Json
          course_id: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
          estimated_duration_minutes: number
          id: string
          learning_objectives: string[]
          organization_id: string
          schema_version: string
          status: string
          subject: string
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          content?: Json
          course_id?: string | null
          created_at?: string
          created_by: string
          deleted_at?: string | null
          deleted_by?: string | null
          estimated_duration_minutes?: number
          id?: string
          learning_objectives?: string[]
          organization_id: string
          schema_version?: string
          status?: string
          subject: string
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          content?: Json
          course_id?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          deleted_by?: string | null
          estimated_duration_minutes?: number
          id?: string
          learning_objectives?: string[]
          organization_id?: string
          schema_version?: string
          status?: string
          subject?: string
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: 'lessons_course_id_fkey'
            columns: ['course_id']
            isOneToOne: false
            referencedRelation: 'courses'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'lessons_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'lessons_deleted_by_fkey'
            columns: ['deleted_by']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'lessons_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          id: string
          name: string
          settings: Json
          slug: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          name: string
          settings?: Json
          slug: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          name?: string
          settings?: Json
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: 'fk_organizations_deleted_by'
            columns: ['deleted_by']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      question_banks: {
        Row: {
          created_at: string
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          id: string
          name: string
          organization_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          name: string
          organization_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'question_banks_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'question_banks_deleted_by_fkey'
            columns: ['deleted_by']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'question_banks_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      question_comments: {
        Row: {
          body: string
          created_at: string
          deleted_at: string | null
          id: string
          question_id: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          question_id: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          question_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'question_comments_question_id_fkey'
            columns: ['question_id']
            isOneToOne: false
            referencedRelation: 'questions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'question_comments_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      questions: {
        Row: {
          bank_id: string
          created_at: string
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
          difficulty: string
          explanation_image_url: string | null
          explanation_text: string
          id: string
          lo_reference: string | null
          options: Json
          organization_id: string
          question_image_url: string | null
          question_number: string | null
          question_text: string
          status: string
          subject_id: string
          subtopic_id: string | null
          topic_id: string
          updated_at: string
          version: number
        }
        Insert: {
          bank_id: string
          created_at?: string
          created_by: string
          deleted_at?: string | null
          deleted_by?: string | null
          difficulty: string
          explanation_image_url?: string | null
          explanation_text: string
          id?: string
          lo_reference?: string | null
          options: Json
          organization_id: string
          question_image_url?: string | null
          question_number?: string | null
          question_text: string
          status?: string
          subject_id: string
          subtopic_id?: string | null
          topic_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          bank_id?: string
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          deleted_by?: string | null
          difficulty?: string
          explanation_image_url?: string | null
          explanation_text?: string
          id?: string
          lo_reference?: string | null
          options?: Json
          organization_id?: string
          question_image_url?: string | null
          question_number?: string | null
          question_text?: string
          status?: string
          subject_id?: string
          subtopic_id?: string | null
          topic_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: 'questions_bank_id_fkey'
            columns: ['bank_id']
            isOneToOne: false
            referencedRelation: 'question_banks'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'questions_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'questions_deleted_by_fkey'
            columns: ['deleted_by']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'questions_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'questions_subject_id_fkey'
            columns: ['subject_id']
            isOneToOne: false
            referencedRelation: 'easa_subjects'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'questions_subtopic_id_fkey'
            columns: ['subtopic_id']
            isOneToOne: false
            referencedRelation: 'easa_subtopics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'questions_topic_id_fkey'
            columns: ['topic_id']
            isOneToOne: false
            referencedRelation: 'easa_topics'
            referencedColumns: ['id']
          },
        ]
      }
      quiz_drafts: {
        Row: {
          answers: Json
          created_at: string
          current_index: number
          id: string
          organization_id: string
          question_ids: string[]
          session_config: Json
          student_id: string
          updated_at: string
        }
        Insert: {
          answers?: Json
          created_at?: string
          current_index?: number
          id?: string
          organization_id: string
          question_ids?: string[]
          session_config?: Json
          student_id: string
          updated_at?: string
        }
        Update: {
          answers?: Json
          created_at?: string
          current_index?: number
          id?: string
          organization_id?: string
          question_ids?: string[]
          session_config?: Json
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'quiz_drafts_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'quiz_drafts_student_id_fkey'
            columns: ['student_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      quiz_session_answers: {
        Row: {
          answered_at: string
          id: string
          is_correct: boolean
          question_id: string
          response_time_ms: number
          selected_option_id: string
          session_id: string
        }
        Insert: {
          answered_at?: string
          id?: string
          is_correct: boolean
          question_id: string
          response_time_ms: number
          selected_option_id: string
          session_id: string
        }
        Update: {
          answered_at?: string
          id?: string
          is_correct?: boolean
          question_id?: string
          response_time_ms?: number
          selected_option_id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'quiz_session_answers_question_id_fkey'
            columns: ['question_id']
            isOneToOne: false
            referencedRelation: 'questions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'quiz_session_answers_session_id_fkey'
            columns: ['session_id']
            isOneToOne: false
            referencedRelation: 'quiz_sessions'
            referencedColumns: ['id']
          },
        ]
      }
      quiz_sessions: {
        Row: {
          config: Json
          correct_count: number
          created_at: string
          deleted_at: string | null
          ended_at: string | null
          id: string
          mode: string
          organization_id: string
          score_percentage: number | null
          started_at: string
          student_id: string
          subject_id: string | null
          topic_id: string | null
          total_questions: number
        }
        Insert: {
          config?: Json
          correct_count?: number
          created_at?: string
          deleted_at?: string | null
          ended_at?: string | null
          id?: string
          mode: string
          organization_id: string
          score_percentage?: number | null
          started_at?: string
          student_id: string
          subject_id?: string | null
          topic_id?: string | null
          total_questions?: number
        }
        Update: {
          config?: Json
          correct_count?: number
          created_at?: string
          deleted_at?: string | null
          ended_at?: string | null
          id?: string
          mode?: string
          organization_id?: string
          score_percentage?: number | null
          started_at?: string
          student_id?: string
          subject_id?: string | null
          topic_id?: string | null
          total_questions?: number
        }
        Relationships: [
          {
            foreignKeyName: 'quiz_sessions_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'quiz_sessions_student_id_fkey'
            columns: ['student_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'quiz_sessions_subject_id_fkey'
            columns: ['subject_id']
            isOneToOne: false
            referencedRelation: 'easa_subjects'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'quiz_sessions_topic_id_fkey'
            columns: ['topic_id']
            isOneToOne: false
            referencedRelation: 'easa_topics'
            referencedColumns: ['id']
          },
        ]
      }
      student_responses: {
        Row: {
          created_at: string
          id: string
          is_correct: boolean
          organization_id: string
          question_id: string
          response_time_ms: number
          selected_option_id: string
          session_id: string | null
          student_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_correct: boolean
          organization_id: string
          question_id: string
          response_time_ms: number
          selected_option_id: string
          session_id?: string | null
          student_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_correct?: boolean
          organization_id?: string
          question_id?: string
          response_time_ms?: number
          selected_option_id?: string
          session_id?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'student_responses_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'student_responses_question_id_fkey'
            columns: ['question_id']
            isOneToOne: false
            referencedRelation: 'questions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'student_responses_session_id_fkey'
            columns: ['session_id']
            isOneToOne: false
            referencedRelation: 'quiz_sessions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'student_responses_student_id_fkey'
            columns: ['student_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          email: string
          full_name: string | null
          id: string
          last_active_at: string | null
          organization_id: string
          role: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          email: string
          full_name?: string | null
          id: string
          last_active_at?: string | null
          organization_id: string
          role: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string
          full_name?: string | null
          id?: string
          last_active_at?: string | null
          organization_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: 'fk_users_deleted_by'
            columns: ['deleted_by']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'users_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      batch_submit_quiz: {
        Args: { p_answers: Json; p_session_id: string }
        Returns: Json
      }
      check_quiz_answer: {
        Args: {
          p_question_id: string
          p_selected_option_id: string
          p_session_id: string
        }
        Returns: Json
      }
      complete_quiz_session: {
        Args: { p_session_id: string }
        Returns: {
          correct_count: number
          score_percentage: number
          total_questions: number
        }[]
      }
      get_daily_activity: {
        Args: { p_days?: number; p_student_id: string }
        Returns: {
          correct: number
          day: string
          incorrect: number
          total: number
        }[]
      }
      get_quiz_questions: {
        Args: { p_question_ids: string[] }
        Returns: {
          difficulty: string
          explanation_image_url: string
          explanation_text: string
          id: string
          lo_reference: string
          options: Json
          question_image_url: string
          question_number: string
          question_text: string
          subject_code: string
          subtopic_name: string
          topic_name: string
        }[]
      }
      get_report_correct_options: {
        Args: { p_session_id: string }
        Returns: {
          correct_option_id: string
          question_id: string
        }[]
      }
      get_subject_scores: {
        Args: { p_limit?: number; p_student_id: string }
        Returns: {
          avg_score: number
          session_count: number
          subject_id: string
          subject_name: string
          subject_short: string
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      record_login: { Args: never; Returns: undefined }
      start_quiz_session: {
        Args: {
          p_mode: string
          p_question_ids: string[]
          p_subject_id: string
          p_topic_id: string
        }
        Returns: string
      }
      submit_quiz_answer: {
        Args: {
          p_question_id: string
          p_response_time_ms: number
          p_selected_option: string
          p_session_id: string
        }
        Returns: {
          correct_option_id: string
          explanation_image_url: string
          explanation_text: string
          is_correct: boolean
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
