'use client'

import { useState } from 'react'
import { useComments } from '../session/_hooks/use-comments'

type CommentsTabProps = {
  questionId: string
  currentUserId: string
}

function getAvatarColor(name: string): string {
  const colors = [
    'bg-blue-500',
    'bg-amber-500',
    'bg-purple-500',
    'bg-green-500',
    'bg-pink-500',
    'bg-cyan-500',
  ]
  const index = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % colors.length
  return colors[index] ?? 'bg-blue-500'
}

function getInitials(name: string | null): string {
  if (!name) return '?'
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export function CommentsTab({ questionId, currentUserId }: CommentsTabProps) {
  const { comments, isLoading, error, addComment, removeComment } = useComments(questionId)
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    if (!body.trim() || submitting) return
    setSubmitting(true)
    const ok = await addComment(body.trim())
    if (ok) setBody('')
    setSubmitting(false)
  }

  if (isLoading) return <CommentsSkeleton />

  return (
    <div className="space-y-4 py-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Comments</h3>
        <span className="text-xs text-muted-foreground">
          {comments.length} comment{comments.length !== 1 ? 's' : ''}
        </span>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {comments.length === 0 && !error && (
        <p className="py-4 text-center text-sm text-muted-foreground">
          No comments yet. Be the first to comment.
        </p>
      )}

      <div className="space-y-3">
        {comments.map((c) => {
          const name = c.users?.full_name ?? 'Unknown'
          const isAdmin = c.users?.role === 'admin'
          const isOwn = c.user_id === currentUserId
          return (
            <div
              key={c.id}
              className={`flex gap-3 ${isAdmin ? 'rounded-lg bg-primary/5 p-3' : ''}`}
            >
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${getAvatarColor(name)}`}
              >
                {getInitials(name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{name}</span>
                  {isAdmin && (
                    <span className="rounded-full bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">
                      LMS Plus
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {new Date(c.created_at).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                </div>
                <p className="mt-1 text-sm">{c.body}</p>
                {isOwn && (
                  <button
                    type="button"
                    onClick={() => removeComment(c.id)}
                    className="mt-1 text-xs text-destructive hover:underline"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex gap-2 border-t border-border pt-3">
        <input
          type="text"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder="Add a comment..."
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          disabled={submitting}
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!body.trim() || submitting}
          className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Post
        </button>
      </div>
    </div>
  )
}

function CommentsSkeleton() {
  return (
    <div className="space-y-3 py-4">
      <div className="flex gap-3">
        <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-24 animate-pulse rounded bg-muted" />
          <div className="h-3 w-full animate-pulse rounded bg-muted" />
        </div>
      </div>
      <div className="flex gap-3">
        <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-20 animate-pulse rounded bg-muted" />
          <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
        </div>
      </div>
    </div>
  )
}
