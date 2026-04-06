import { getWeakTopics } from '../queries'
import { WeakTopicsList } from './weak-topics-list'

export async function WeakTopicsContent() {
  try {
    const topics = await getWeakTopics()
    return <WeakTopicsList topics={topics} />
  } catch {
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        Failed to load weak topics. Please refresh the page.
      </div>
    )
  }
}
