'use client'

import type { ReactNode } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { FieldError } from '@/components/ui/field-error'
import { Label } from '@/components/ui/label'
import { useSittingUi } from '../_hooks/sitting-ui-context'
import { plural } from '../_utils/plural'
import { addPeopleBanner } from '../_utils/popup-copy'
import { addCandidates } from '../actions/add-candidates'
import { type AddablePerson, PEOPLE_PAGE_SIZE } from '../types'
import { type AddGroup, PeopleFooter } from './people-footer'
import { PeoplePager } from './people-pager'
import { PopupBody } from './popup-parts'
import { SelectPageCheckbox } from './select-page-checkbox'
import { useSittingAction } from './use-sitting-action'

type Props = {
  sittingId: string
  filters: ReactNode
  rows: readonly AddablePerson[]
  total: number
  page: number
  group: AddGroup | null
}

function PersonItem({ person, busy }: Readonly<{ person: AddablePerson; busy: boolean }>) {
  const { people } = useSittingUi()
  const label = person.name || person.email
  return (
    <li className="py-2">
      <Label className="items-start text-body text-foreground">
        <Checkbox
          className="mt-1"
          aria-label={`Select ${label}`}
          checked={people.ids.includes(person.userId)}
          disabled={busy || person.deactivated}
          onCheckedChange={() => people.toggle(person.userId)}
        />
        <span className="block min-w-0">
          <span className="font-medium">{label}</span>
          <span className="block text-caption break-all text-muted-foreground">{person.email}</span>
          <span className="block text-caption text-muted-foreground">
            {[person.groups, person.courses].filter(Boolean).join(' · ')}
          </span>
          {person.deactivated && (
            <span className="block text-caption text-muted-foreground">Deactivated</span>
          )}
        </span>
      </Label>
    </li>
  )
}

function SelectBar({
  rows,
  total,
  busy,
}: Readonly<{ rows: readonly AddablePerson[]; total: number; busy: boolean }>) {
  const { people } = useSittingUi()
  const ids = rows.filter((r) => !r.deactivated).map((r) => r.userId)
  const onPage = ids.filter((id) => people.ids.includes(id)).length
  return (
    <div className="flex items-center gap-3 border-b py-2 text-caption">
      <SelectPageCheckbox
        total={ids.length}
        ticked={onPage}
        disabled={busy}
        onChange={(checked) => people.setMany(ids, checked)}
      />
      <span className="text-muted-foreground">{plural(total, 'student')}</span>
    </div>
  )
}

/** Body and footer of the Add people popup. Ticks live in the provider so they survive filter changes. */
export function PeopleList({ sittingId, filters, rows, total, page, group }: Readonly<Props>) {
  const { people, isRefreshing, close } = useSittingUi()
  const { pending, error, run } = useSittingAction()
  const busy = isRefreshing || pending
  const add = (input: { userIds?: string[]; groupIds?: string[] }) =>
    run(
      () => addCandidates({ sittingId, ...input }),
      (d) => {
        people.clear()
        close()
        return addPeopleBanner(d)
      },
      { lock: true },
    )
  return (
    <>
      <div className="space-y-stack px-dialog-pad pb-stack">
        {filters}
        <SelectBar rows={rows} total={total} busy={busy} />
      </div>
      <PopupBody>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-muted-foreground">No students to add.</p>
        ) : (
          <ul className="divide-y">
            {rows.map((r) => (
              <PersonItem key={r.userId} person={r} busy={busy} />
            ))}
          </ul>
        )}
        <PeoplePager
          page={page}
          pages={Math.max(1, Math.ceil(total / PEOPLE_PAGE_SIZE))}
          disabled={busy}
        />
        <FieldError role="alert">{error}</FieldError>
      </PopupBody>
      <PeopleFooter
        ticked={people.ids.length}
        group={group}
        pending={pending}
        busy={busy}
        onAddSelected={() => add({ userIds: people.ids })}
        onAddGroup={() => group && add({ groupIds: [group.id] })}
        onClear={people.clear}
      />
    </>
  )
}
