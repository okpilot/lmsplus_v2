export function PrivacyPolicyContent() {
  return (
    <>
      <p className="text-xs text-muted-foreground">
        Last updated: March 2026 &mdash;{' '}
        <em>
          This document is provided for informational purposes and should be reviewed by qualified
          legal counsel before relying on it.
        </em>
      </p>

      <h1>Privacy Policy</h1>

      <h2>1. Who We Are</h2>
      <p>
        LMS Plus is an EASA PPL training platform. We are the data controller for personal data
        processed through this service. Controller contact: support@lmsplus.eu (full legal entity
        details to be added before production launch).
      </p>

      <h2>2. Data We Collect</h2>
      <p>
        Name, email address, and organisation membership; study progress including quiz scores,
        response times, and session data; login timestamps; IP addresses (for consent records and
        security logging).
      </p>

      <h2>3. Legal Basis</h2>
      <p>
        Platform operation: legitimate interest. Audit records required by CAA/EASA: legal
        obligation.
      </p>

      <h2>4. How We Store It</h2>
      <p>
        Data is hosted on Supabase (EU region), encrypted at rest and in transit. Access is
        restricted to authenticated users via row-level security policies.
      </p>

      <h2>5. Cookies</h2>
      <p>
        We use essential cookies only: an authentication session cookie and a consent record cookie.
        No analytics or tracking cookies are used.
      </p>

      <h2>6. Data Retention</h2>
      <p>
        Active data is retained while your account exists. Audit logs are retained per CAA/EASA
        record-keeping requirements. Soft-deleted data is purged after 90 days.
      </p>

      <h2>7. Who Has Access</h2>
      <p>
        Your flight school administrators can see their students&apos; progress. Platform operators
        access data only for support and maintenance purposes.
      </p>

      <h2>8. Your GDPR Rights</h2>
      <p>
        You have the right to access, rectify, erase, and port your data, and to restrict or object
        to processing and withdraw consent at any time. Contact us at{' '}
        <a href="mailto:support@lmsplus.eu">support@lmsplus.eu</a> to exercise any right.
      </p>

      <h2>9. Data Export and Deletion</h2>
      <p>
        You may request a copy of your data or account deletion at any time. We will respond within
        30 days as required by GDPR.
      </p>

      <h2>10. Changes to This Policy</h2>
      <p>
        We may update this policy. When we do, you will be asked to review and re-consent on your
        next login.
      </p>

      <h2>11. Contact</h2>
      <p>
        General enquiries: <a href="mailto:support@lmsplus.eu">support@lmsplus.eu</a>
        <br />
        Data Protection Officer: <a href="mailto:dpo@lmsplus.eu">dpo@lmsplus.eu</a>
      </p>
    </>
  )
}
