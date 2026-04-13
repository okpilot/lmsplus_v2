import { getExamConfigData } from '../queries'
import { ExamConfigPageShell } from './exam-config-page-shell'

export async function ExamConfigContent() {
  const subjects = await getExamConfigData()
  return <ExamConfigPageShell subjects={subjects} />
}
