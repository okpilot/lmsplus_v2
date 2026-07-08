'use server'

import { z } from 'zod'
import { requireAuthUser } from '@/lib/auth/require-auth-user'
import type {
  SubtopicOption,
  TopicOption,
  TopicWithSubtopics,
} from '@/lib/queries/quiz-query-types'
import {
  getSubtopicsForTopic,
  getTopicsForSubject,
  getTopicsWithSubtopics,
} from '@/lib/queries/quiz-subject-queries'

const IdSchema = z.uuid()

export async function fetchTopicsForSubject(raw: unknown): Promise<TopicOption[]> {
  await requireAuthUser()
  let id: string
  try {
    id = IdSchema.parse(raw)
  } catch {
    console.error('[fetchTopicsForSubject] Invalid input')
    return []
  }
  try {
    return await getTopicsForSubject(id)
  } catch (error) {
    console.error(
      '[fetchTopicsForSubject] query error:',
      error instanceof Error ? error.message : error,
    )
    return []
  }
}

export async function fetchSubtopicsForTopic(raw: unknown): Promise<SubtopicOption[]> {
  await requireAuthUser()
  let id: string
  try {
    id = IdSchema.parse(raw)
  } catch {
    console.error('[fetchSubtopicsForTopic] Invalid input')
    return []
  }
  try {
    return await getSubtopicsForTopic(id)
  } catch (error) {
    console.error(
      '[fetchSubtopicsForTopic] query error:',
      error instanceof Error ? error.message : error,
    )
    return []
  }
}

export async function fetchTopicsWithSubtopics(raw: unknown): Promise<TopicWithSubtopics[]> {
  await requireAuthUser()
  let id: string
  try {
    id = IdSchema.parse(raw)
  } catch {
    console.error('[fetchTopicsWithSubtopics] Invalid input')
    return []
  }
  try {
    return await getTopicsWithSubtopics(id)
  } catch (error) {
    console.error(
      '[fetchTopicsWithSubtopics] query error:',
      error instanceof Error ? error.message : error,
    )
    return []
  }
}

// getFilteredCount lives in ./filtered-count.ts (extracted — code-style.md §1
// same-commit extraction, this file was already over the 100-line Server Action cap).
