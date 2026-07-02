'use client'

import { Loader2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { useComments } from '../session/_hooks/use-comments'
import { getAvatarColor, getInitials } from './comment-helpers'
import { CommentsSkeleton } from './comments-skeleton'

type CommentsTabProps = {
  questionId: string
  currentUserId: string
}

export function CommentsTab({ questionId, currentUserId }: Readonly<CommentsTabProps>) {
  const { comments, isLoading, error, addComment, removeComment } = useComments(questionId)
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)

  async function handleSubmit() {
    if (!body.trim() || submitting) return
    if (submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    try {
      const ok = await addComment(body.trim())
      if (ok) setBody('')
    } catch (err) {
      // addComment awaits a Server Action that can reject (network/RSC failure). Catch it
      // locally so it doesn't escape this click handler as an unhandled rejection; the
      // comment text is preserved (setBody not cleared) so the student can retry.
      console.error('[CommentsTab] Failed to post comment:', err)
    } finally {
      // Always release the locks — on success, the caught rejection, or an early return —
      // otherwise the Post button would stay disabled and block retries.
      submittingRef.current = false
      setSubmitting(false)
    }
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
                    onClick={() => {
                      // Catch so a rejected deleteComment Server Action doesn't escape this
                      // handler as an unhandled rejection (same guard as handleSubmit above).
                      removeComment(c.id).catch((err) =>
                        console.error('[CommentsTab] Failed to delete comment:', err),
                      )
                    }}
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
          aria-busy={submitting || undefined}
          className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          <span className="inline-flex items-center justify-center gap-2">
            {submitting && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
            {submitting ? 'Posting...' : 'Post'}
          </span>
        </button>
      </div>
    </div>
  )
}
