'use client'

import { Download } from 'lucide-react'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { downloadJsonFile } from '@/lib/gdpr/download-json'
import { exportStudentData } from '../actions/export-student-data'
import type { StudentRow } from '../types'

type Props = {
  student: StudentRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ExportStudentDialog({ student, open, onOpenChange }: Readonly<Props>) {
  const [isPending, startTransition] = useTransition()

  function handleExport() {
    if (!student) return
    startTransition(async () => {
      try {
        const result = await exportStudentData({ userId: student.id })
        if (!result.success) {
          toast.error(result.error)
          return
        }

        const safePrefix = (student.email.split('@')[0] ?? 'student').replace(
          /[^a-zA-Z0-9._-]/g,
          '_',
        )
        downloadJsonFile(
          result.data,
          `student-export-${safePrefix}-${new Date().toISOString().slice(0, 10)}.json`,
        )

        toast.success('Student data exported')
        onOpenChange(false)
      } catch {
        toast.error('Failed to export student data')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export student data</DialogTitle>
          <DialogDescription>
            Download all data for {student?.full_name ?? student?.email} as a JSON file (GDPR
            Articles 15 &amp; 20).
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={isPending || !student}>
            <Download className="mr-2 size-4" />
            {isPending ? 'Exporting…' : 'Export'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
