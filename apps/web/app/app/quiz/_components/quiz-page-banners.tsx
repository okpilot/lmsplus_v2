import type { ActiveExamSession } from '../actions/get-active-exam-session'
import type { ActivePracticeSession } from '../actions/get-active-practice-session'
import { ActivePracticeBanner } from './active-practice-banner'
import { ExpiredExamNotice } from './expired-exam-notice'
import { ResumeExamBanner } from './resume-exam-banner'

type Props = {
  userId: string
  activeExams: ActiveExamSession[]
  orphanedIds: string[]
  expiredIds: string[]
  activePractice: ActivePracticeSession | null
}

/** Banners for sessions the student left open: exams to resume or discard, and practice. */
export function QuizPageBanners({
  userId,
  activeExams,
  orphanedIds,
  expiredIds,
  activePractice,
}: Readonly<Props>) {
  return (
    <>
      {activeExams.map((exam) => (
        <ResumeExamBanner key={exam.sessionId} userId={userId} exam={exam} />
      ))}
      {orphanedIds.map((sessionId) => (
        <ResumeExamBanner key={sessionId} userId={userId} sessionId={sessionId} discardOnly />
      ))}
      {expiredIds.map((sessionId) => (
        <ExpiredExamNotice key={sessionId} sessionId={sessionId} />
      ))}
      {activePractice && <ActivePracticeBanner userId={userId} session={activePractice} />}
    </>
  )
}
