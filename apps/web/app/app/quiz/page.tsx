import { Suspense } from 'react'
import { requireAuthUser } from '@/lib/auth/require-auth-user'
import { ActivePracticeBanner } from './_components/active-practice-banner'
import { ExpiredExamNotice } from './_components/expired-exam-notice'
import { LookupErrorAlerts } from './_components/lookup-error-alerts'
import { QuizRecoveryBanner } from './_components/quiz-recovery-banner'
import { QuizTabs } from './_components/quiz-tabs'
import { ResumeExamBanner } from './_components/resume-exam-banner'
import { SavedDraftCard } from './_components/saved-draft-card'
import { SubjectsSection } from './_components/subjects-section'
import { getActiveExamSession } from './actions/get-active-exam-session'
import { getActivePracticeSession } from './actions/get-active-practice-session'
import { loadDrafts } from './actions/load-draft'

export const dynamic = 'force-dynamic'

export default async function QuizPage() {
  const user = await requireAuthUser()

  const [{ drafts }, examResult, practiceResult] = await Promise.all([
    loadDrafts(),
    getActiveExamSession(),
    getActivePracticeSession(),
  ])

  const examLookupFailed = !examResult.success
  const activeExams = examResult.success ? examResult.sessions : []
  const orphanedIds = examResult.success ? examResult.orphanedSessionIds : []
  const expiredIds = examResult.success ? examResult.expiredSessionIds : []
  const practiceLookupFailed = !practiceResult.success
  const activePractice = practiceResult.success ? practiceResult.session : null

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Quiz</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure and start a practice session.
        </p>
      </div>

      <LookupErrorAlerts examFailed={examLookupFailed} practiceFailed={practiceLookupFailed} />

      {activeExams.map((exam) => (
        <ResumeExamBanner key={exam.sessionId} userId={user.id} exam={exam} />
      ))}

      {orphanedIds.map((sessionId) => (
        <ResumeExamBanner key={sessionId} userId={user.id} sessionId={sessionId} discardOnly />
      ))}

      {expiredIds.map((sessionId) => (
        <ExpiredExamNotice key={sessionId} sessionId={sessionId} />
      ))}

      {activePractice && <ActivePracticeBanner session={activePractice} />}

      <QuizRecoveryBanner userId={user.id} />

      <div className="mx-auto max-w-xl">
        <QuizTabs
          draftCount={drafts.length}
          newQuizContent={
            <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-muted" />}>
              <SubjectsSection userId={user.id} />
            </Suspense>
          }
          savedDraftContent={<SavedDraftCard drafts={drafts} userId={user.id} />}
        />
      </div>
    </main>
  )
}
