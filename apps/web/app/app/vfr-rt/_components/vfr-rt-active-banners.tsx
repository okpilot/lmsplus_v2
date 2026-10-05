import { ActivePracticeBanner } from '@/app/app/quiz/_components/active-practice-banner'
import { ExpiredExamNotice } from '@/app/app/quiz/_components/expired-exam-notice'
import { LookupErrorAlerts } from '@/app/app/quiz/_components/lookup-error-alerts'
import { ResumeExamBanner } from '@/app/app/quiz/_components/resume-exam-banner'
import { getActiveExamSession } from '@/app/app/quiz/actions/get-active-exam-session'
import { getActivePracticeSession } from '@/app/app/quiz/actions/get-active-practice-session'

/**
 * The open sessions that block a start, read from the server: an open practice quiz and
 * any open Practice Exam, plus a notice for a Practice Exam this read auto-submitted. Resume links to the session page; Discard stays on the banners.
 * A VFR RT exam in progress resumes by starting it again (the start RPC returns the open one).
 */
export async function VfrRtActiveBanners({ userId }: Readonly<{ userId: string }>) {
  const [examResult, practiceResult] = await Promise.all([
    getActiveExamSession(),
    getActivePracticeSession(),
  ])
  const exams = examResult.success ? examResult.sessions : []
  const orphanedIds = examResult.success ? examResult.orphanedSessionIds : []
  const expiredIds = examResult.success ? examResult.expiredSessionIds : []
  const practice = practiceResult.success ? practiceResult.session : null

  return (
    <>
      <LookupErrorAlerts
        examFailed={!examResult.success}
        practiceFailed={!practiceResult.success}
      />
      {expiredIds.map((sessionId) => (
        <ExpiredExamNotice key={sessionId} sessionId={sessionId} />
      ))}
      {exams.map((exam) => (
        <ResumeExamBanner key={exam.sessionId} userId={userId} exam={exam} />
      ))}
      {orphanedIds.map((sessionId) => (
        <ResumeExamBanner key={sessionId} userId={userId} sessionId={sessionId} discardOnly />
      ))}
      {practice && <ActivePracticeBanner userId={userId} session={practice} />}
    </>
  )
}
