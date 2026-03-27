export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <div className="prose prose-sm dark:prose-invert">{children}</div>
    </main>
  )
}
