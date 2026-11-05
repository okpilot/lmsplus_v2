'use client'

import { Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { SyllabusTree } from '../../syllabus/types'
import type { QuestionRow } from '../types'
import { CalcBadge } from './calc-badge'
import { DeleteQuestionButton } from './delete-question-button'
import { QuestionFormDialog } from './question-form-dialog'
import { formatDate, truncate } from './question-table-helpers'

type Props = {
  questions: QuestionRow[]
  tree: SyllabusTree
  selectedIds: string[]
  onToggleSelect: (id: string) => void
  onToggleAll: () => void
}

export function QuestionTable({
  questions,
  tree,
  selectedIds,
  onToggleSelect,
  onToggleAll,
}: Readonly<Props>) {
  const allSelected = questions.length > 0 && selectedIds.length === questions.length

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">
            <Checkbox
              checked={allSelected}
              onCheckedChange={() => onToggleAll()}
              aria-label="Select all questions"
            />
          </TableHead>
          <TableHead className="w-col-xs">#</TableHead>
          <TableHead className="min-w-col-xl">Question</TableHead>
          <TableHead className="w-col-code">Subject</TableHead>
          <TableHead className="w-col-md">Topic</TableHead>
          <TableHead className="w-col-xs">Calc</TableHead>
          <TableHead className="w-col-xs">Status</TableHead>
          <TableHead className="w-col-sm">Updated</TableHead>
          <TableHead className="w-col-xs">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {questions.map((q) => {
          const selected = selectedIds.includes(q.id)
          return (
            <TableRow key={q.id} data-state={selected ? 'selected' : undefined}>
              <TableCell>
                <Checkbox
                  checked={selected}
                  onCheckedChange={() => onToggleSelect(q.id)}
                  aria-label={`Select question ${q.question_number ?? q.id}`}
                />
              </TableCell>
              <TableCell className="tabular-nums text-caption text-muted-foreground">
                {q.question_number ?? '\u2014'}
              </TableCell>
              <TableCell className="max-w-question-cell">
                <div className="flex">
                  <Tooltip>
                    <TooltipTrigger render={<span className="min-w-0 flex-1 truncate" />}>
                      {q.question_text}
                    </TooltipTrigger>
                    <TooltipContent className="max-w-popover whitespace-pre-wrap break-words">
                      {q.question_text}
                    </TooltipContent>
                  </Tooltip>
                </div>
              </TableCell>
              <TableCell>
                <span className="text-caption-strong">{q.subject?.code ?? '\u2014'}</span>
              </TableCell>
              <TableCell>
                <span className="text-caption text-muted-foreground">
                  {q.topic?.name ? truncate(q.topic.name, 30) : '\u2014'}
                </span>
              </TableCell>
              <TableCell>
                {q.has_calculations ? (
                  <CalcBadge />
                ) : (
                  <span className="text-caption text-muted-foreground">{'—'}</span>
                )}
              </TableCell>
              <TableCell>
                <Badge tone={q.status === 'active' ? 'success' : 'neutral'}>{q.status}</Badge>
              </TableCell>
              <TableCell className="text-caption tabular-nums text-muted-foreground">
                {formatDate(q.updated_at)}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <Tooltip>
                    <QuestionFormDialog
                      tree={tree}
                      question={q}
                      trigger={
                        <TooltipTrigger
                          render={
                            <Button variant="ghost" size="icon-sm" aria-label="Edit question" />
                          }
                        >
                          <Pencil className="size-icon-sm text-muted-foreground" />
                        </TooltipTrigger>
                      }
                    />
                    <TooltipContent>Edit question</TooltipContent>
                  </Tooltip>
                  <DeleteQuestionButton
                    id={q.id}
                    label={q.question_number ?? q.question_text.slice(0, 40)}
                  />
                </div>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
