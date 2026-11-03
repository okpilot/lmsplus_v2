import type { Metadata } from 'next'
import { Heading } from '@/components/ui/heading'

export const metadata: Metadata = { title: 'Terms of Service — LMS Plus' }

export default function TermsPage() {
  return (
    <>
      <Heading level={1}>Terms of Service</Heading>
      <p className="text-caption text-muted-foreground">Last updated: March 2026</p>

      <Heading level={2} className="pt-stack">
        1. Acceptance
      </Heading>
      <p className="text-body">
        By creating an account and using LMS Plus, you agree to these Terms of Service. If you do
        not agree, do not use the platform.
      </p>

      <Heading level={2} className="pt-stack">
        2. Service Description
      </Heading>
      <p className="text-body">
        LMS Plus is an online study aid for EASA PPL theoretical knowledge exams.
      </p>
      <ul className="list-disc space-y-1 pl-prose-indent text-body">
        <li>
          It is <strong>not</strong> a substitute for training delivered by an approved training
          organisation (ATO)
        </li>
        <li>It does not confer any official certification or licence</li>
      </ul>

      <Heading level={2} className="pt-stack">
        3. Accounts
      </Heading>
      <ul className="list-disc space-y-1 pl-prose-indent text-body">
        <li>
          Accounts are provisioned by your flight school administrator — one account per student
        </li>
        <li>You are responsible for keeping your credentials secure</li>
        <li>Do not share your account with anyone</li>
      </ul>

      <Heading level={2} className="pt-stack">
        4. Acceptable Use
      </Heading>
      <p className="text-body">You may use LMS Plus for personal study only. You must not:</p>
      <ul className="list-disc space-y-1 pl-prose-indent text-body">
        <li>Share your account credentials with others</li>
        <li>Scrape content programmatically or use automated tools to access the platform</li>
        <li>Reproduce, redistribute, or sell question bank material in any form</li>
        <li>Attempt to access other students&apos; data or administrative functions</li>
      </ul>

      <Heading level={2} className="pt-stack">
        5. Intellectual Property
      </Heading>
      <p className="text-body">
        The platform and its question content are proprietary. The EASA syllabus structure is public
        domain. Nothing in these terms grants you a licence to reproduce or distribute platform
        content.
      </p>

      <Heading level={2} className="pt-stack">
        6. Limitation of Liability
      </Heading>
      <p className="text-body">LMS Plus is a study aid and:</p>
      <ul className="list-disc space-y-1 pl-prose-indent text-body">
        <li>Does not guarantee exam success</li>
        <li>
          We accept no liability for exam outcomes, scheduling decisions, or any loss arising from
          your use of the platform
        </li>
      </ul>

      <Heading level={2} className="pt-stack">
        7. Changes to These Terms
      </Heading>
      <p className="text-body">
        We may update these terms at any time. When we do, you will be asked to review and re-accept
        on your next login.
      </p>

      <Heading level={2} className="pt-stack">
        8. Contact
      </Heading>
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
