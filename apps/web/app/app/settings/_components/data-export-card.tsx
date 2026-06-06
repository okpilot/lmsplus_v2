'use client'

import { Download } from 'lucide-react'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { downloadJsonFile } from '@/lib/gdpr/download-json'
import { exportMyData } from '../gdpr-actions'

export function DataExportCard() {
  const [isPending, startTransition] = useTransition()

  function handleExport() {
    startTransition(async () => {
      try {
        const result = await exportMyData()
        if (!result.success) {
          toast.error(result.error)
          return
        }

        downloadJsonFile(
          result.data,
          `lmsplus-data-export-${new Date().toISOString().slice(0, 10)}.json`,
        )

        // The export still downloads on a partial failure (right of access is never denied),
        // but the requester must be told it may be incomplete rather than seeing plain success.
        if (result.data.warnings.length > 0) {
          toast.warning(
            'Export downloaded, but some sections could not be loaded and may be incomplete. Please try again.',
          )
        } else {
          toast.success('Data exported successfully')
        }
      } catch {
        toast.error('Failed to export data')
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your Data</CardTitle>
        <CardDescription>
          Download a copy of all your data in machine-readable JSON format (GDPR Articles 15 &amp;
          20).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={handleExport} disabled={isPending} variant="outline">
          <Download className="mr-2 size-4" />
          {isPending ? 'Exporting...' : 'Export My Data'}
        </Button>
      </CardContent>
    </Card>
  )
}
