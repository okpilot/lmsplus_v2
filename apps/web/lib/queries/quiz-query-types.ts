export type SubjectOption = {
  id: string
  code: string
  name: string
  short: string
  questionCount: number
}

export type TopicOption = {
  id: string
  code: string
  name: string
  questionCount: number
}

export type SubtopicOption = {
  id: string
  code: string
  name: string
  questionCount: number
}

export type TopicWithSubtopics = {
  id: string
  code: string
  name: string
  questionCount: number
  subtopics: SubtopicOption[]
}
