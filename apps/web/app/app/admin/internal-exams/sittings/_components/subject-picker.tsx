'use client'

import { useMemo, useState } from 'react'
import { FieldError } from '@/components/ui/field-error'
import { Input } from '@/components/ui/input'
import { useSittingUi } from '../_hooks/sitting-ui-context'
import { addExamsBanner, sameDayText } from '../_utils/popup-copy'
import { subjectRowView } from '../_utils/subject-state'
import { addSittingExams } from '../actions/add-exams'
import type { SameDayPerson, SubjectEligibility } from '../types'
import { AddExamsFooter } from './add-exams-footer'
import { OptionSelect } from './option-select'
import { PopupBody } from './popup-parts'
import { SelectPageCheckbox } from './select-page-checkbox'
import { SubjectRow } from './subject-row'
import { useSittingAction } from './use-sitting-action'

type Props = {
  sittingId: string
  rows: readonly SubjectEligibility[]
  /** Undefined = every candidate of the sitting (select-all). */
  userIds: readonly string[] | undefined
  peopleCount: number
  singleDeactivated: boolean
  sameDay: readonly SameDayPerson[]
}

const ALL = 'all'

function useSubjectPicker(rows: readonly SubjectEligibility[], singleDeactivated: boolean) {
  const [search, setSearch] = useState('')
  const [course, setCourse] = useState(ALL)
  const [picked, setPicked] = useState<string[]>([])
  const courses = useMemo(() => {
    const byId = new Map<string, string>()
    for (const r of rows) if (r.courseId) byId.set(r.courseId, r.courseName ?? r.courseId)
    return [...byId.entries()]
  }, [rows])
  const q = search.trim().toLowerCase()
  const shown = rows
    .filter((r) => course === ALL || r.courseId === course)
    .filter(
      (r) =>
        !q || r.subjectShort.toLowerCase().includes(q) || r.subjectName.toLowerCase().includes(q),
    )
    .map((row) => ({ row, view: subjectRowView(row, singleDeactivated) }))
  const tickable = shown.filter((s) => s.view.tickable).map((s) => s.row.subjectId)
  const toggle = (id: string) =>
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
  const setMany = (ids: readonly string[], on: boolean) =>
    setPicked((cur) =>
      on ? [...new Set([...cur, ...ids])] : cur.filter((id) => !ids.includes(id)),
    )
  return { search, setSearch, course, setCourse, courses, picked, shown, tickable, toggle, setMany }
}

type Picker = ReturnType<typeof useSubjectPicker>

function SubjectToolbar({ s, busy, warn }: Readonly<{ s: Picker; busy: boolean; warn: string }>) {
  return (
    <div className="space-y-stack px-dialog-pad pb-stack">
      {warn && <p className="text-caption text-muted-foreground">{warn}</p>}
      <div className="grid min-w-0 gap-2 sm:grid-cols-2">
        <div className="min-w-0 space-y-1">
          <span className="block text-label text-muted-foreground">Search exams</span>
          <Input
            aria-label="Search exams"
            value={s.search}
            placeholder="Subject"
            className="min-w-0"
            onChange={(e) => s.setSearch(e.target.value)}
          />
        </div>
        <OptionSelect
          label="Course"
          value={s.course}
          options={[
            { value: ALL, label: 'All courses' },
            ...s.courses.map(([id, name]) => ({ value: id, label: name })),
          ]}
          onChange={s.setCourse}
        />
      </div>
      {s.tickable.length > 0 && (
        <div className="border-b py-2">
          <SelectPageCheckbox
            total={s.tickable.length}
            ticked={s.tickable.filter((id) => s.picked.includes(id)).length}
            disabled={busy}
            label="Select all exams"
            onChange={(on) => s.setMany(s.tickable, on)}
          />
        </div>
      )}
    </div>
  )
}

function SubjectList({ s, busy }: Readonly<{ s: Picker; busy: boolean }>) {
  if (s.shown.length === 0) {
    return <p className="py-6 text-center text-muted-foreground">No exams match.</p>
  }
  return (
    <ul className="divide-y">
      {s.shown.map(({ row, view }) => (
        <SubjectRow
          key={row.subjectId}
          row={row}
          view={view}
          checked={s.picked.includes(row.subjectId)}
          busy={busy}
          onToggle={s.toggle}
        />
      ))}
    </ul>
  )
}

/** Body and footer of the Add exams popup. Submits every picked exam for every person of the selection. */
export function SubjectPicker({
  sittingId,
  rows,
  userIds,
  peopleCount,
  singleDeactivated,
  sameDay,
}: Readonly<Props>) {
  const { isRefreshing, close } = useSittingUi()
  const { pending, error, run } = useSittingAction()
  const s = useSubjectPicker(rows, singleDeactivated)
  const busy = isRefreshing || pending
  const shortOf = (id: string) => rows.find((r) => r.subjectId === id)?.subjectShort
  const submit = () =>
    run(
      () =>
        addSittingExams({
          sittingId,
          subjectIds: s.picked,
          ...(userIds ? { userIds } : { all: true }),
        }),
      (d) => {
        close()
        return addExamsBanner(d, shortOf)
      },
      { lock: true },
    )
  return (
    <>
      <SubjectToolbar s={s} busy={busy} warn={sameDayText(sameDay)} />
      <PopupBody>
        <SubjectList s={s} busy={busy} />
        <FieldError role="alert">{error}</FieldError>
        {singleDeactivated && (
          <p className="text-caption text-destructive">Deactivated students cannot be entered.</p>
        )}
      </PopupBody>
      <AddExamsFooter
        exams={s.picked.length}
        people={peopleCount}
        singleDeactivated={singleDeactivated}
        busy={busy}
        pending={pending}
        onSubmit={submit}
      />
    </>
  )
}
