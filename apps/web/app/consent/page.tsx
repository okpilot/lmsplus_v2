import { safeNextPath } from '@/lib/auth/safe-next-path'
import { ConsentForm } from './_components/consent-form'

type Props = {
  searchParams: Promise<{ next?: string }>
}

export default async function ConsentPage({ searchParams }: Readonly<Props>) {
  const { next } = await searchParams

  return (
    <main className="flex min-h-screen items-center justify-center px-gutter py-section">
      <div className="w-full max-w-reading">
        <ConsentForm nextPath={safeNextPath(next)} />
      </div>
    </main>
  )
}
