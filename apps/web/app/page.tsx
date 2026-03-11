import { LoginForm } from './_components/login-form'

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-center text-2xl font-semibold tracking-tight">LMS Plus</h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Sign in with your flight school email
        </p>
        <div className="mt-8">
          <LoginForm />
        </div>
      </div>
    </main>
  )
}
