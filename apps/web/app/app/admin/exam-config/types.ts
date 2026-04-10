export type ExamConfigDistribution = {
  id: string
  topicId: string
  topicCode: string
  topicName: string
  subtopicId: string | null
  subtopicCode: string | null
  subtopicName: string | null
  questionCount: number
  availableQuestions: number
}

export type ExamConfig = {
  id: string
  subjectId: string
  enabled: boolean
  totalQuestions: number
  timeLimitSeconds: number
  passMark: number
  distributions: ExamConfigDistribution[]
}

export type SubjectWithConfig = {
  id: string
  code: string
  name: string
  short: string
  config: ExamConfig | null
  topics: TopicInfo[]
}

export type TopicInfo = {
  id: string
  code: string
  name: string
  availableQuestions: number
  subtopics: SubtopicInfo[]
}

export type SubtopicInfo = {
  id: string
  code: string
  name: string
  availableQuestions: number
}
