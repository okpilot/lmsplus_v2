import { DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { isEnded, isGone } from '../_utils/is-ended'
import type { PeopleFilters as Filters } from '../parse-sitting-params'
import {
  getGroupAddCounts,
  listCourseOptions,
  listGroupOptions,
  listPeople,
} from '../people-queries'
import { PeopleFilters } from './people-filters'
import { PeopleList } from './people-list'
import { PopupEnded } from './popup-message'
import { PopupHeader } from './popup-parts'

type Props = { sittingId: string; filters: Filters }

/** Server body of the Add people popup. People already in the sitting are not listed. */
export async function AddPeopleContent({ sittingId, filters }: Readonly<Props>) {
  const [people, groups, courses] = await Promise.all([
    listPeople({ sittingId, ...filters }),
    listGroupOptions(),
    listCourseOptions(),
  ])
  if (isGone(people)) return <PopupEnded title="Add people" />
  const group = groups.find((g) => g.id === filters.group)
  const counts = group ? await getGroupAddCounts(sittingId, group.id) : null
  if (isEnded(counts)) return <PopupEnded title="Add people" />
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
        page={filters.page}
        group={group && counts ? { ...counts, id: group.id, name: group.name } : null}
      />
    </>
  )
}
