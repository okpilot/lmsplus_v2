'use client'

import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { QuestionRow } from '../types'

type Props = {
  questions: QuestionRow[]
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

export function QuestionTable({ questions }: Props) {
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
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
