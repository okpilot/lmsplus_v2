export function PrivacyPolicyContent() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="text-sm text-muted-foreground">Last updated: March 2026</p>

      <h2>1. Who We Are</h2>
      <p>
        LMS Plus is an EASA PPL training platform. We are the data controller for personal data
        processed through this service.
      </p>
      <ul>
        <li>
          Controller contact: <a href="mailto:support@lmsplus.eu">support@lmsplus.eu</a>
        </li>
        <li>Full legal entity details to be added before production launch.</li>
      </ul>

      <h2>2. Data We Collect</h2>
      <ul>
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

      <h2>3. Legal Basis</h2>
      <ul>
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

      <h2>4. How We Store It</h2>
      <p>Data is hosted on Supabase (EU region) with the following protections:</p>
      <ul>
        <li>Encrypted at rest and in transit</li>
        <li>Access restricted to authenticated users via row-level security policies</li>
        <li>Service-role access limited to server-side administrative operations</li>
      </ul>

      <h2>5. Cookies</h2>
      <p>
        We use <strong>essential cookies only</strong>:
      </p>
      <ul>
        <li>An authentication session cookie (required to keep you signed in)</li>
        <li>A consent record cookie (tracks which document versions you have accepted)</li>
      </ul>
      <p>No analytics, advertising, or tracking cookies are used.</p>

      <h2>6. Data Retention &amp; EASA Compliance</h2>
      <p>
        Training records (quiz sessions, scores, and responses) are retained as required by{' '}
        <strong>EASA Part ORA</strong> for regulatory auditing purposes.
      </p>
      <ul>
        <li>These records must identify the student and cannot be anonymised or deleted</li>
        <li>Deactivated accounts remain subject to this retention requirement</li>
        <li>Non-training data is retained only while your account is active</li>
      </ul>

      <h2>7. Who Has Access</h2>
      <ul>
        <li>
          <strong>Flight school administrators:</strong> can view their students&apos; progress and
          export student data
        </li>
        <li>
          <strong>Platform operators:</strong> access data only for support and maintenance
        </li>
      </ul>

      <h2>8. Your GDPR Rights</h2>

      <h3>Right of access &amp; data portability (Articles 15 &amp; 20)</h3>
      <p>
        You can download a copy of all your data in JSON format from your <strong>Settings</strong>{' '}
        page at any time.
      </p>

      <h3>Right to rectification (Article 16)</h3>
      <p>You can update your name and other profile information from your Settings page.</p>

      <h3>Right to restrict processing (Article 18)</h3>
      <p>
        You may request account deactivation by contacting your flight school administrator or{' '}
        <a href="mailto:support@lmsplus.eu">support@lmsplus.eu</a>.
      </p>

      <h3>Right to erasure (Article 17)</h3>
      <p>
        Under GDPR Article 17(3)(b), the right to erasure does not apply where processing is
        necessary for compliance with a legal obligation. EASA Part ORA requires retention of
        identified training records for regulatory auditing. Training data cannot be deleted or
        anonymised while this obligation applies.
      </p>

      <h3>Other rights</h3>
      <p>
        To exercise any other right or raise a concern, contact us at{' '}
        <a href="mailto:dpo@lmsplus.eu">dpo@lmsplus.eu</a>.
      </p>

      <h2>9. Changes to This Policy</h2>
      <p>
        We may update this policy. When we do, you will be asked to review and re-consent on your
        next login.
      </p>

      <h2>10. Contact</h2>
      <ul>
        <li>
          General enquiries: <a href="mailto:support@lmsplus.eu">support@lmsplus.eu</a>
        </li>
        <li>
          Data Protection Officer: <a href="mailto:dpo@lmsplus.eu">dpo@lmsplus.eu</a>
        </li>
      </ul>
    </>
  )
}
