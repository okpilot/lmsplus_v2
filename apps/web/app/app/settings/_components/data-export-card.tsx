'use client'

import { Download } from 'lucide-react'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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

        const blob = new Blob([JSON.stringify(result.data, null, 2)], {
          type: 'application/json',
        })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `lmsplus-data-export-${new Date().toISOString().slice(0, 10)}.json`
        document.body.appendChild(link)
        link.click()
        link.remove()
        setTimeout(() => URL.revokeObjectURL(url), 0)

        toast.success('Data exported successfully')
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
