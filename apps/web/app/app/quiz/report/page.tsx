import { QuizReportView } from './report-view'

export default async function QuizReportPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ session?: string; page?: string }>
}>) {
  const { session, page } = await searchParams
  return <QuizReportView sessionId={session} pageParam={page} namespace="quiz" />
}
