import { getSyllabusTree } from '../queries'
import { SyllabusManager } from './syllabus-manager'

export async function SyllabusContent() {
  const tree = await getSyllabusTree()
  return <SyllabusManager initialTree={tree} />
}
