export type SyllabusSubtopic = {
  id: string
  code: string
  name: string
  sort_order: number
  questionCount: number
}

export type SyllabusTopic = {
  id: string
  code: string
  name: string
  sort_order: number
  questionCount: number
  subtopics: SyllabusSubtopic[]
}

export type SyllabusSubject = {
  id: string
  code: string
  name: string
  short: string
  sort_order: number
  questionCount: number
  topics: SyllabusTopic[]
}

export type SyllabusTree = SyllabusSubject[]
