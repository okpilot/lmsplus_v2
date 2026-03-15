import { SyllabusManager } from './_components/syllabus-manager'
import { getSyllabusTree } from './queries'

export default async function SyllabusPage() {
  const tree = await getSyllabusTree()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Syllabus Manager</h1>
        <p className="text-sm text-muted-foreground">
          Manage the EASA PPL subject hierarchy. Add subjects, topics, and subtopics.
        </p>
      </div>
      <SyllabusManager initialTree={tree} />
    </div>
  )
}
