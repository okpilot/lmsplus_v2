// Full-screen overlay for quiz sessions. AppShell also strips nav for /session
// routes — both layers are needed: AppShell removes nav from the React tree,
// this layout provides the fixed fullscreen container.
export default function QuizSessionLayout({ children }: { children: React.ReactNode }) {
  return <div className="fixed inset-0 z-50 flex flex-col bg-background">{children}</div>
}
