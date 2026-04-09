import { isRedirectError } from 'next/dist/client/components/redirect-error'
import { getWeakTopics } from '../queries'
import { ContentErrorFallback } from './content-error-fallback'
import { WeakTopicsList } from './weak-topics-list'

export async function WeakTopicsContent() {
  try {
    const topics = await getWeakTopics()
    return <WeakTopicsList topics={topics} />
  } catch (error) {
    if (isRedirectError(error)) throw error
    return <ContentErrorFallback message="Failed to load weak topics. Please refresh the page." />
  }
}
