'use client'

import { Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { SyllabusTree } from '../../syllabus/types'
import type { QuestionRow } from '../types'
import { DeleteQuestionButton } from './delete-question-button'
import { QuestionFormDialog } from './question-form-dialog'

type Props = {
  questions: QuestionRow[]
  tree: SyllabusTree
}

function difficultyVariant(d: string) {
  switch (d) {
    case 'easy':
      return 'secondary' as const
    case 'medium':
      return 'default' as const
    case 'hard':
      return 'destructive' as const
    default:
      return 'secondary' as const
  }
}

function truncate(text: string, max: number) {
  if (text.length <= max) return text
  return `${text.slice(0, max)}\u2026`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function QuestionTable({ questions, tree }: Props) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">#</TableHead>
            <TableHead className="min-w-[300px]">Question</TableHead>
            <TableHead className="w-24">Subject</TableHead>
            <TableHead className="w-40">Topic</TableHead>
            <TableHead className="w-24">Difficulty</TableHead>
            <TableHead className="w-20">Status</TableHead>
            <TableHead className="w-28">Updated</TableHead>
            <TableHead className="w-20">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {questions.map((q) => (
            <TableRow key={q.id}>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {q.question_number ?? '\u2014'}
              </TableCell>
              <TableCell className="max-w-[400px]">
                <span className="text-sm">{truncate(q.question_text, 90)}</span>
              </TableCell>
              <TableCell>
                <span className="text-xs font-medium">{q.subject?.code ?? '\u2014'}</span>
              </TableCell>
              <TableCell>
                <span className="text-xs text-muted-foreground">
                  {q.topic?.name ? truncate(q.topic.name, 30) : '\u2014'}
                </span>
              </TableCell>
              <TableCell>
                <Badge variant={difficultyVariant(q.difficulty)} className="text-xs">
                  {q.difficulty}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant={q.status === 'active' ? 'default' : 'outline'} className="text-xs">
                  {q.status}
                </Badge>
              </TableCell>
              <TableCell className="text-xs tabular-nums text-muted-foreground">
                {formatDate(q.updated_at)}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <QuestionFormDialog
                    tree={tree}
                    question={q}
                    trigger={
                      <Button variant="ghost" size="icon-xs" title="Edit question">
                        <Pencil className="size-3.5 text-muted-foreground" />
                      </Button>
                    }
                  />
                  <DeleteQuestionButton
                    id={q.id}
                    label={q.question_number ?? q.question_text.slice(0, 40)}
                  />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
