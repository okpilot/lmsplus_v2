import type { QuizPageData } from '../_loaders/load-quiz-page-data'
import { ActivePracticeBanner } from './active-practice-banner'
import { ExpiredExamNotice } from './expired-exam-notice'
import { QuizRecoveryBanner } from './quiz-recovery-banner'
import { ResumeExamBanner } from './resume-exam-banner'

export function QuizPageBanners({
  userId,
  activeExams,
  orphanedIds,
  expiredIds,
  activePractice,
}: Readonly<
  { userId: string } & Pick<
    QuizPageData,
    'activeExams' | 'orphanedIds' | 'expiredIds' | 'activePractice'
  >
>) {
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

      <QuizRecoveryBanner userId={userId} />
    </>
  )
}
