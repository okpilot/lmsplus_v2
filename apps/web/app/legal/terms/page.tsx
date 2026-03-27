import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Terms of Service — LMS Plus' }

export default function TermsPage() {
  return (
    <>
      <p className="text-xs text-muted-foreground">
        Last updated: March 2026 &mdash;{' '}
        <em>
          This document is provided for informational purposes and should be reviewed by qualified
          legal counsel before relying on it.
        </em>
      </p>

      <h1>Terms of Service</h1>

      <h2>1. Acceptance</h2>
      <p>
        By creating an account and using LMS Plus, you agree to these Terms of Service. If you do
        not agree, do not use the platform.
      </p>

      <h2>2. Service Description</h2>
      <p>
        LMS Plus is an online study aid for EASA PPL theoretical knowledge exams. It is not a
        substitute for training delivered by an approved training organisation (ATO) and does not
        confer any official certification.
      </p>

      <h2>3. Accounts</h2>
      <p>
        Accounts are provisioned by your flight school administrator — one account per student. You
        are responsible for keeping your credentials secure. Do not share your account with anyone.
      </p>

      <h2>4. Acceptable Use</h2>
      <p>
        You may use LMS Plus for personal study only. You must not share accounts, scrape content
        programmatically, or redistribute question bank material in any form.
      </p>

      <h2>5. Intellectual Property</h2>
      <p>
        The platform and its question content are proprietary. The EASA syllabus structure is public
        domain. Nothing in these terms grants you a licence to reproduce or distribute platform
        content.
      </p>

      <h2>6. Limitation of Liability</h2>
      <p>
        LMS Plus is a study aid and does not guarantee exam success. We accept no liability for exam
        outcomes, scheduling decisions, or any loss arising from your use of the platform.
      </p>

      <h2>7. Changes to These Terms</h2>
      <p>
        We may update these terms at any time. When we do, you will be asked to review and re-accept
        on your next login.
      </p>

      <h2>8. Contact</h2>
      <p>
        Questions about these terms? Email us at{' '}
        <a href="mailto:support@lmsplus.eu">support@lmsplus.eu</a>.
      </p>
    </>
  )
}
