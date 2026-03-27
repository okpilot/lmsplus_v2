import type { Metadata } from 'next'
import { PrivacyPolicyContent } from './_components/privacy-policy-content'

export const metadata: Metadata = { title: 'Privacy Policy — LMS Plus' }

export default function PrivacyPage() {
  return <PrivacyPolicyContent />
}
