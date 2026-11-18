import { getCourses, getGroupOptions } from '@/app/app/admin/students/queries'
import { DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { isEnded, isGone } from '../_utils/is-ended'
import type { PeopleFilters as Filters } from '../parse-sitting-params'
import { getGroupAddCounts, listPeople } from '../people-queries'
import { PeopleFilters } from './people-filters'
import { PeopleList } from './people-list'
import { PopupEnded } from './popup-message'
import { PopupHeader } from './popup-parts'

type Props = { sittingId: string; filters: Filters }

/** Server body of the Add people popup. People already in the sitting are not listed. */
export async function AddPeopleContent({ sittingId, filters }: Readonly<Props>) {
  const [people, groups, courses, counts] = await Promise.all([
    listPeople({ sittingId, ...filters }),
    getGroupOptions(),
    getCourses(),
    filters.group ? getGroupAddCounts(sittingId, filters.group) : Promise.resolve(null),
  ])
  if (isGone(people) || isEnded(counts)) return <PopupEnded title="Add people" />
  const group = groups.find((g) => g.id === filters.group)
  return (
    <>
      <PopupHeader>
        <DialogTitle>Add people</DialogTitle>
        <DialogDescription>
          Groups are copied into the sitting; later group changes do not touch it.
        </DialogDescription>
      </PopupHeader>
      <PeopleList
        sittingId={sittingId}
        filters={
          <PeopleFilters
            groups={groups}
            courses={courses}
            q={filters.q ?? ''}
            group={filters.group ?? ''}
            course={filters.course ?? ''}
            status={filters.status ?? 'active'}
          />
        }
        rows={people.rows}
        total={people.total}
        page={people.page}
        group={group && counts ? { ...counts, id: group.id, name: group.name } : null}
      />
    </>
  )
}
