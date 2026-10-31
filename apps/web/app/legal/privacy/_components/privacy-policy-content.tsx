import { Heading } from '@/components/ui/heading'

export function PrivacyPolicyContent() {
  return (
    <>
      <Heading level={1}>Privacy Policy</Heading>
      <p className="text-caption text-muted-foreground">Last updated: March 2026</p>

      <Heading level={2} className="pt-stack">
        1. Who We Are
      </Heading>
      <p className="text-body">
        LMS Plus is an EASA PPL training platform. We are the data controller for personal data
        processed through this service.
      </p>
      <ul className="list-disc space-y-1 pl-prose-indent text-body">
        <li>
          Controller contact:{' '}
          <a className="underline underline-offset-2" href="mailto:support@lmsplus.eu">
            support@lmsplus.eu
          </a>
        </li>
        <li>Full legal entity details to be added before production launch.</li>
      </ul>

      <Heading level={2} className="pt-stack">
        2. Data We Collect
      </Heading>
      <ul className="list-disc space-y-1 pl-prose-indent text-body">
        <li>
          <strong>Identity:</strong> name, email address, organisation membership
        </li>
        <li>
          <strong>Training activity:</strong> quiz scores, response times, session data, spaced
          repetition state
        </li>
        <li>
          <strong>Technical:</strong> login timestamps, IP addresses (for consent records and
          security logging)
        </li>
      </ul>

      <Heading level={2} className="pt-stack">
        3. Legal Basis
      </Heading>
      <ul className="list-disc space-y-1 pl-prose-indent text-body">
        <li>
          <strong>Platform operation:</strong> legitimate interest (Art. 6(1)(f))
        </li>
        <li>
          <strong>Training records &amp; audit logs:</strong> legal obligation under EASA Part ORA
          (Art. 6(1)(c))
        </li>
        <li>
          <strong>Consent tracking:</strong> consent (Art. 6(1)(a))
        </li>
      </ul>

      <Heading level={2} className="pt-stack">
        4. How We Store It
      </Heading>
      <p className="text-body">
        Data is hosted on Supabase (EU region) with the following protections:
      </p>
      <ul className="list-disc space-y-1 pl-prose-indent text-body">
        <li>Encrypted at rest and in transit</li>
        <li>Access restricted to authenticated users via row-level security policies</li>
        <li>Service-role access limited to server-side administrative operations</li>
      </ul>

      <Heading level={2} className="pt-stack">
        5. Cookies
      </Heading>
      <p className="text-body">
        We use <strong>essential cookies only</strong>:
      </p>
      <ul className="list-disc space-y-1 pl-prose-indent text-body">
        <li>An authentication session cookie (required to keep you signed in)</li>
        <li>A consent record cookie (tracks which document versions you have accepted)</li>
      </ul>
      <p className="text-body">No analytics, advertising, or tracking cookies are used.</p>

      <Heading level={2} className="pt-stack">
        6. Data Retention &amp; EASA Compliance
      </Heading>
      <p className="text-body">
        Training records (quiz sessions, scores, and responses) are retained as required by{' '}
        <strong>EASA Part ORA</strong> for regulatory auditing purposes.
      </p>
      <ul className="list-disc space-y-1 pl-prose-indent text-body">
        <li>These records must identify the student and cannot be anonymised or deleted</li>
        <li>Deactivated accounts remain subject to this retention requirement</li>
        <li>Non-training data is retained only while your account is active</li>
      </ul>

      <Heading level={2} className="pt-stack">
        7. Who Has Access
      </Heading>
      <ul className="list-disc space-y-1 pl-prose-indent text-body">
        <li>
          <strong>Flight school administrators:</strong> can view their students&apos; progress and
          export student data
        </li>
        <li>
          <strong>Platform operators:</strong> access data only for support and maintenance
        </li>
      </ul>

      <Heading level={2} className="pt-stack">
        8. Your GDPR Rights
      </Heading>

      <Heading level={3} className="text-label">
        Right of access &amp; data portability (Articles 15 &amp; 20)
      </Heading>
      <p className="text-body">
        You can download a copy of all your data in JSON format from your <strong>Settings</strong>{' '}
        page at any time.
      </p>

      <Heading level={3} className="text-label">
        Right to rectification (Article 16)
      </Heading>
      <p className="text-body">
        You can update your name and other profile information from your Settings page.
      </p>

      <Heading level={3} className="text-label">
        Right to restrict processing (Article 18)
      </Heading>
      <p className="text-body">
        You may request account deactivation by contacting your flight school administrator or{' '}
        <a className="underline underline-offset-2" href="mailto:support@lmsplus.eu">
          support@lmsplus.eu
        </a>
        .
      </p>

      <Heading level={3} className="text-label">
        Right to erasure (Article 17)
      </Heading>
      <p className="text-body">
        Under GDPR Article 17(3)(b), the right to erasure does not apply where processing is
        necessary for compliance with a legal obligation. EASA Part ORA requires retention of
        identified training records for regulatory auditing. Training data cannot be deleted or
        anonymised while this obligation applies.
      </p>

      <Heading level={3} className="text-label">
        Other rights
      </Heading>
      <p className="text-body">
        To exercise any other right or raise a concern, contact us at{' '}
        <a className="underline underline-offset-2" href="mailto:dpo@lmsplus.eu">
          dpo@lmsplus.eu
        </a>
        .
      </p>

      <Heading level={2} className="pt-stack">
        9. Changes to This Policy
      </Heading>
      <p className="text-body">
        We may update this policy. When we do, you will be asked to review and re-consent on your
        next login.
      </p>

      <Heading level={2} className="pt-stack">
        10. Contact
      </Heading>
      <ul className="list-disc space-y-1 pl-prose-indent text-body">
        <li>
          General enquiries:{' '}
          <a className="underline underline-offset-2" href="mailto:support@lmsplus.eu">
            support@lmsplus.eu
          </a>
        </li>
        <li>
          Data Protection Officer:{' '}
          <a className="underline underline-offset-2" href="mailto:dpo@lmsplus.eu">
            dpo@lmsplus.eu
          </a>
        </li>
      </ul>
    </>
  )
}
