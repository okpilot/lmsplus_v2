-- Narrow tenant_isolation to FOR SELECT on organizations, question_banks,
-- courses and lessons. Follow-up to 20260809000100, which did the same for
-- public.questions. Closes GHSA-hjp9-x868-7wgw §2 and issue #1175.
--
-- DEFECT. A CREATE POLICY with no FOR clause is FOR ALL: it governs SELECT,
-- INSERT, UPDATE and DELETE alike. All four tables were created that way in
-- 20260311000001_initial_schema.sql (organizations :283, question_banks :318,
-- courses :340, lessons :351) and none of those four POLICIES has been
-- redefined since. The TABLES have been altered — 20260327000062 adds
-- question_banks' UNIQUE (organization_id), cited again below — so read this
-- as a claim about the policies, not about the tables. All three
-- supersession forms were traced: supabase/migrations/ contains no ALTER POLICY
-- STATEMENT (grep the phrase and the only hit is this comment), no later bare
-- CREATE POLICY on any of the four, and the only PRE-EXISTING DROP POLICY ...
-- tenant_isolation statements target users (20260311000004:6,
-- 20260312000012:11) and questions (20260809000100:124) — this file adds four
-- more below, so read that enumeration as "before this migration".
--
-- Unlike questions, these four carry NO OTHER POLICY AT ALL. questions had
-- is_admin()-gated write policies that the OR-ed FOR ALL policy dissolved;
-- here there is no role gate to dissolve, because the unqualified
-- tenant_isolation policy IS the entire access control. Write access is scoped
-- only by org membership: any authenticated in-org user satisfies it.
--
-- VERIFIED AGAINST PRODUCTION 2026-08-20 (read-only Management API probe;
-- previously unverified because the access token had expired — issue #1183):
--   * pg_policies returns EXACTLY ONE row per table, all cmd = ALL, PERMISSIVE,
--     roles {public}, predicates byte-equal to mig 001. No hand-created extra
--     policy exists on prod, so this migration closes the path completely.
--   * information_schema.role_table_grants shows `authenticated` holding
--     DELETE, INSERT, SELECT, TRIGGER, TRUNCATE, UPDATE, REFERENCES on all
--     four. The grant premise is therefore MEASURED, not inferred: RLS is the
--     only thing standing between an in-org user and these rows. (`anon` holds
--     the same grants but is blocked by the predicate — auth.uid() is NULL for
--     it, so the subquery yields NULL and the policy is never true.)
--
-- WHAT IS ACTUALLY REACHABLE TODAY. Stated per verb, because the policy
-- passing and a constraint then rejecting are different things:
--
--   UPDATE  — yes, on all four. Including
--             `UPDATE organizations SET deleted_at = now()`: organizations'
--             WITH CHECK keys on `id` alone, with no deleted_at conjunct, so
--             the post-image still satisfies it. An in-org student can soft-
--             delete their own organisation.
--   INSERT  — courses and lessons freely. On question_banks and organizations
--             the POLICY PASSES and a constraint rejects: UNIQUE
--             (organization_id) (20260327000062:11) for a second bank in an org
--             that already has one, and a primary-key collision for
--             organizations, whose WITH CHECK constrains the PK itself.
--   DELETE  — lessons, and childless courses, outright. On organizations (11
--             NOT NULL child FKs) and a populated question_banks
--             (questions.bank_id, 20260311000001:108) the policy passes and 23503
--             rejects.
--             Hard DELETE also contradicts security.md rule 6 independently.
--
-- IMPACT, not overstated. The organizations UPDATE is unauthorised tampering
-- with the TENANT ROOT RECORD, not a denial of service. Exactly one production
-- read gates on organizations.deleted_at — apps/web/lib/queries/profile.ts:67-71
-- — and it degrades to organizationName: null by design ("a missing org must
-- not break the whole profile page"). Every other consumer resolves the org by
-- slug or id with no deleted_at filter, so nothing is denied service. The
-- user-visible effect today is a blanked org name; the durable harm is a forged
-- soft-delete state on the tenant root that no application path observes or
-- reverses.
--
-- FIX. Re-emit each policy as FOR SELECT with a byte-identical USING predicate,
-- reproducing mig 001's exact line layout (subquery on one line) so the
-- byte-identity claim is literally true and diff-checkable. WITH CHECK is
-- dropped because a FOR SELECT policy cannot carry one — and note the clause
-- was NOT inert on question_banks/courses/lessons: its `AND deleted_at IS NULL`
-- is what currently blocks a user-scoped soft-delete UPDATE on those three. It
-- retires with the whole write path, which is what makes dropping it safe. Any
-- future user-scoped write policy on these tables must re-carry that conjunct
-- in its own WITH CHECK.
--
-- Resulting policy set, per table:
--   SELECT — tenant_isolation, predicate unchanged, so no read regression
--   INSERT — no permissive policy
--   UPDATE — no permissive policy
--   DELETE — no permissive policy (matching security.md rule 6)
--
-- WHO IS AFFECTED. service_role writes are unaffected: it holds BYPASSRLS, so
-- FORCE ROW LEVEL SECURITY does not bind it, and every write to these four
-- tables in the repo already goes through packages/db/src/admin.ts or an
-- equivalent service-key client. ALL RLS-BOUND WRITES ARE DENIED, INCLUDING AN
-- AUTHENTICATED ADMIN'S — requireAdmin() returns createServerSupabaseClient()
-- (apps/web/lib/auth/require-admin.ts:11), an RLS-bound client, and these four
-- have no is_admin() write policy to fall back on. That is the disanalogy with
-- questions and it is deliberate: no admin UI writes these tables. A future
-- feature that needs a user-scoped write must add its own role-gated policy.
--
-- READS: verified unaffected. The only two user-scoped call sites are plain
-- SELECTs — apps/web/lib/queries/profile.ts:67 (organizations; it applies
-- .is('deleted_at', null) itself) and
-- apps/web/app/app/admin/questions/actions/insert-question.ts:21
-- (question_banks). courses and lessons have zero PRODUCTION call sites — the
-- only .from('courses')/.from('lessons') call site anywhere in the tree is this
-- commit's own red-team spec, apps/web/e2e/redteam/
-- tenant-tables-direct-write.spec.ts (both tables are of course still modelled
-- in packages/db/src/types.ts and created by mig 001). No
-- migration reads or writes these tables, there is no trigger on any of them,
-- no SECURITY INVOKER function references them, and all 13 child FKs are
-- NO ACTION, so nothing cascades a write into them.
--
-- organizations' PREDICATE ASYMMETRY IS PRESERVED DELIBERATELY. It keys on `id`
-- rather than organization_id and carries no deleted_at conjunct. Byte-identical
-- reproduction is the acceptance criterion of #1175, and adding the filter would
-- be a read-behaviour change. Consequence a future author must know:
-- as of 2026-08-20 organizations REMAINS the only table carrying a
-- tenant_isolation policy whose predicate has no deleted_at conjunct — it
-- already was, this migration does not create the asymmetry. That set is open:
-- any later migration adding or replacing a policy can change it, so derive it
-- from the docs/database.md §3 query rather than from this line. (It is not the
-- only soft-deletable table read without an RLS deleted_at filter at all:
-- flagged_questions filters via the active_flagged_questions view and an
-- explicit .is('deleted_at', null) in _flag-guard.ts:75, internal_exam_codes'
-- sole SELECT policy constrains users rather than the code row, and
-- quiz_sessions' and exam_configs' policy sets each have one SELECT policy that
-- omits it. docs/database.md §3 carries the query that derives the current set
-- rather than a list that goes stale.) So a SECURITY INVOKER function reading organizations
-- CANNOT rely on RLS for soft-delete scoping and must filter explicitly, the way
-- profile.ts already does.
--
-- STATEMENT ORDER. organizations is last. Its own DROP->CREATE window is the
-- same length wherever the pair sits, so ordering does not shorten it; the
-- reason is different. No migration in this repo issues an explicit
-- BEGIN;/COMMIT; (verify with `grep -l 'BEGIN;' supabase/migrations/*.sql` —
-- the only hit is this comment; a bare count is not stated because the set
-- grows with every migration), so atomicity rests on the runner. If the runner
-- does not wrap the file and a statement aborts mid-way, every pair after the
-- abort keeps its old policy and every pair before it has the new one. Each
-- DROP is immediately followed by its CREATE, so the only way to strand a table
-- with NO policy at all is an abort landing on a CREATE specifically; an abort
-- on a DROP (the likelier case — these carry no IF EXISTS) leaves that table
-- untouched. BOTH user-scoped reads are exposed to that window equally
-- (question_banks is the FIRST pair, organizations the last), so the order does
-- not privilege one over the other; organizations is last simply because it is
-- the tenant root, and its read (profile.ts:67) is the one that already
-- degrades gracefully. Do NOT add a bare BEGIN; here: it diverges from
-- 20260809000100 and risks a nested-transaction warning.
--
-- After this migration, no table in the public schema carries an unqualified
-- tenant_isolation policy.

DROP POLICY tenant_isolation ON public.question_banks;

CREATE POLICY tenant_isolation ON public.question_banks
  FOR SELECT
  USING (
    organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
    AND deleted_at IS NULL
  );

DROP POLICY tenant_isolation ON public.courses;

CREATE POLICY tenant_isolation ON public.courses
  FOR SELECT
  USING (
    organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
    AND deleted_at IS NULL
  );

DROP POLICY tenant_isolation ON public.lessons;

CREATE POLICY tenant_isolation ON public.lessons
  FOR SELECT
  USING (
    organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
    AND deleted_at IS NULL
  );

-- Last, deliberately — see STATEMENT ORDER above.
DROP POLICY tenant_isolation ON public.organizations;

CREATE POLICY tenant_isolation ON public.organizations
  FOR SELECT
  USING (
    id = (SELECT organization_id FROM users WHERE id = auth.uid())
  );
