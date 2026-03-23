// Quiz session uses the AppShell fullscreen path (no sidebar/header).
// This layout just ensures the session fills the viewport height.
export default function QuizSessionLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-[100dvh] flex-col">{children}</div>
}
