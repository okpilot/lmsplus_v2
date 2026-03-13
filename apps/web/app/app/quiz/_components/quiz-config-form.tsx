'use client'

import type { SubjectOption } from '@/lib/queries/quiz'
import { useQuizConfig } from '../_hooks/use-quiz-config'
import { QuestionFilters } from './question-filters'

type QuizConfigFormProps = {
  subjects: SubjectOption[]
}

export function QuizConfigForm({ subjects }: QuizConfigFormProps) {
  const {
    subjectId,
    topicId,
    subtopicId,
    setSubtopicId,
    topics,
    subtopics,
    filter,
    setFilter,
    count,
    setCount,
    loading,
    error,
    isPending,
    maxQuestions,
    filteredCount,
    handleSubjectChange,
    handleTopicChange,
    handleStart,
  } = useQuizConfig({ subjects })

  return (
    <div className="space-y-4">
      <SelectField
        id="subject"
        label="Subject"
        value={subjectId}
        onChange={handleSubjectChange}
        placeholder="Select a subject..."
        options={subjects.map((s) => ({
          value: s.id,
          label: `${s.code} — ${s.name} (${s.questionCount})`,
        }))}
      />

      {topics.length > 0 && (
        <SelectField
          id="topic"
          label="Topic (optional)"
          value={topicId}
          onChange={handleTopicChange}
          placeholder="All topics"
          options={topics.map((t) => ({
            value: t.id,
            label: `${t.code} — ${t.name} (${t.questionCount})`,
          }))}
        />
      )}

      {subtopics.length > 0 && (
        <SelectField
          id="subtopic"
          label="Subtopic (optional)"
          value={subtopicId}
          onChange={(v) => setSubtopicId(v)}
          placeholder="All subtopics"
          options={subtopics.map((st) => ({
            value: st.id,
            label: `${st.code} — ${st.name} (${st.questionCount})`,
          }))}
        />
      )}

      {subjectId && <QuestionFilters value={filter} onChange={setFilter} />}

      {subjectId && (
        <div>
          <label htmlFor="count" className="mb-1.5 block text-sm font-medium">
            Number of questions: {Math.min(count, maxQuestions || 1)}
          </label>
          <input
            id="count"
            type="range"
            min={1}
            max={maxQuestions || 1}
            value={Math.min(count, maxQuestions || 1)}
            onChange={(e) => setCount(Number(e.target.value))}
            className="w-full accent-primary"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {filter !== 'all' && filteredCount === null
              ? 'Counting…'
              : `Up to ${maxQuestions} available`}
          </p>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <button
        type="button"
        disabled={!subjectId || loading || isPending}
        onClick={handleStart}
        className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {loading ? 'Starting...' : 'Start Quiz'}
      </button>
    </div>
  )
}

type SelectFieldProps = {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  options: { value: string; label: string }[]
}

function SelectField({ id, label, value, onChange, placeholder, options }: SelectFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}
