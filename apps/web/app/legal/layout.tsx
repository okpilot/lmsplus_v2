import { Card, CardContent } from '@/components/ui/card'

export default function LegalLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="px-gutter py-section">
      <Card className="mx-auto max-w-reading">
        <CardContent className="space-y-stack">{children}</CardContent>
      </Card>
    </main>
  )
}
