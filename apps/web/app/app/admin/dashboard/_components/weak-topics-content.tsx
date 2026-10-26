import { unstable_rethrow } from 'next/navigation'
import { getWeakTopics } from '../queries'
import { ContentErrorFallback } from './content-error-fallback'
import { WeakTopicsList } from './weak-topics-list'

export async function WeakTopicsContent() {
  try {
    const topics = await getWeakTopics()
    return <WeakTopicsList topics={topics} />
  } catch (error) {
    unstable_rethrow(error)
    return <ContentErrorFallback message="Failed to load weak topics. Please refresh the page." />
  }
}
