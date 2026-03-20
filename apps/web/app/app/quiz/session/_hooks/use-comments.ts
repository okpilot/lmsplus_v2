'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { createComment, deleteComment, getComments } from '../../actions/comments'

type Comment = {
  id: string
  question_id: string
  user_id: string
  body: string
  created_at: string
  users: { full_name: string | null; role: string } | null
}

export function useComments(questionId: string) {
  const [comments, setComments] = useState<Comment[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const generation = useRef(0)
  const prevQuestionId = useRef(questionId)

  if (prevQuestionId.current !== questionId) {
    prevQuestionId.current = questionId
    generation.current += 1
    setComments([])
    setError(null)
  }
  const loadComments = useCallback(() => {
    const gen = generation.current
    setError(null)
    setIsLoading(true)
    startTransition(async () => {
      try {
        const result = await getComments({ questionId })
        if (gen !== generation.current) return
        if (result.success) {
          setComments(result.comments as Comment[])
        } else {
          setError(result.error)
        }
      } catch {
        if (gen === generation.current) setError('Failed to load comments.')
      } finally {
        if (gen === generation.current) setIsLoading(false)
      }
    })
  }, [questionId])

  useEffect(() => {
    loadComments()
  }, [loadComments])

  const addComment = useCallback(
    async (body: string) => {
      const result = await createComment({ questionId, body })
      if (result.success) {
        setComments((prev) => [...prev, result.comment as Comment])
        return true
      }
      setError(result.error)
      return false
    },
    [questionId],
  )

  const removeComment = useCallback(async (commentId: string) => {
    const result = await deleteComment({ commentId })
    if (result.success) {
      setComments((prev) => prev.filter((c) => c.id !== commentId))
      return true
    }
    setError(result.error)
    return false
  }, [])

  return { comments, isLoading, error, addComment, removeComment }
}
