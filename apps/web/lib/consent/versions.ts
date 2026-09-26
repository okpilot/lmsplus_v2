/** Current document versions — bump these to trigger re-consent for all users. */
export const CURRENT_TOS_VERSION = 'v1.0'
export const CURRENT_PRIVACY_VERSION = 'v1.0'

/**
 * Cookie name used by proxy to skip DB lookups on every request.
 *
 * Named `__consent_u` (not `__consent`) so a rollout never rewrites the
 * pre-existing `__consent` cookie: Vercel deployment pinning (`__vdpl`,
 * `apps/web/proxy.ts` `pinQuizSessionDeployment`) can keep an in-progress quiz
 * session on the OLD deployment, whose proxy still checks the old cookie name
 * and value. A same-named rewrite would bounce that pinned quiz to /consent
 * mid-session; a new name leaves the old cookie untouched for old deployments.
 */
export const CONSENT_COOKIE = '__consent_u'
