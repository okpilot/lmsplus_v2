import { QuizReportView } from '@/app/app/quiz/report/report-view'

export default async function VfrRtReportPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ session?: string; page?: string }>
}>) {
  const { session, page } = await searchParams
  return <QuizReportView sessionId={session} pageParam={page} namespace="vfr-rt" />
}
