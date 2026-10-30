import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Terms of Service — LMS Plus' }

export default function TermsPage() {
  return (
    <>
      <h1 className="text-title">Terms of Service</h1>
      <p className="text-caption text-muted-foreground">Last updated: March 2026</p>

      <h2 className="pt-stack text-heading">1. Acceptance</h2>
      <p className="text-body">
        By creating an account and using LMS Plus, you agree to these Terms of Service. If you do
        not agree, do not use the platform.
      </p>

      <h2 className="pt-stack text-heading">2. Service Description</h2>
      <p className="text-body">
        LMS Plus is an online study aid for EASA PPL theoretical knowledge exams.
      </p>
      <ul className="list-disc space-y-1 pl-5 text-body">
        <li>
          It is <strong>not</strong> a substitute for training delivered by an approved training
          organisation (ATO)
        </li>
        <li>It does not confer any official certification or licence</li>
      </ul>

      <h2 className="pt-stack text-heading">3. Accounts</h2>
      <ul className="list-disc space-y-1 pl-5 text-body">
        <li>
          Accounts are provisioned by your flight school administrator — one account per student
        </li>
        <li>You are responsible for keeping your credentials secure</li>
        <li>Do not share your account with anyone</li>
      </ul>

      <h2 className="pt-stack text-heading">4. Acceptable Use</h2>
      <p className="text-body">You may use LMS Plus for personal study only. You must not:</p>
      <ul className="list-disc space-y-1 pl-5 text-body">
        <li>Share your account credentials with others</li>
        <li>Scrape content programmatically or use automated tools to access the platform</li>
        <li>Reproduce, redistribute, or sell question bank material in any form</li>
        <li>Attempt to access other students&apos; data or administrative functions</li>
      </ul>

      <h2 className="pt-stack text-heading">5. Intellectual Property</h2>
      <p className="text-body">
        The platform and its question content are proprietary. The EASA syllabus structure is public
        domain. Nothing in these terms grants you a licence to reproduce or distribute platform
        content.
      </p>

      <h2 className="pt-stack text-heading">6. Limitation of Liability</h2>
      <p className="text-body">LMS Plus is a study aid and:</p>
      <ul className="list-disc space-y-1 pl-5 text-body">
        <li>Does not guarantee exam success</li>
        <li>
          We accept no liability for exam outcomes, scheduling decisions, or any loss arising from
          your use of the platform
        </li>
      </ul>

      <h2 className="pt-stack text-heading">7. Changes to These Terms</h2>
      <p className="text-body">
        We may update these terms at any time. When we do, you will be asked to review and re-accept
        on your next login.
      </p>

      <h2 className="pt-stack text-heading">8. Contact</h2>
      <p className="text-body">
        Questions about these terms? Email us at{' '}
        <a className="underline underline-offset-2" href="mailto:support@lmsplus.eu">
          support@lmsplus.eu
        </a>
        .
      </p>
    </>
  )
}
