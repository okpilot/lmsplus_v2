# Manual Evaluation Setup

Prepare the local environment for manual testing of the current feature branch.

## Steps

1. **Check prerequisites**
   - Verify Docker is running (Supabase needs it)
   - Verify current branch and latest commit

2. **Reset local Supabase**
   ```bash
   npx supabase db reset
   ```
   This reapplies all migrations from scratch on a clean database.

3. **Run the feature's seed script**
   - Look in `apps/web/scripts/` for a `seed-*-eval.ts` file matching the current feature
   - If none exists, create one that seeds:
     - Admin user (email/password for easy login)
     - Student user (for permission testing)
     - Enough data to exercise the feature's happy paths AND edge cases
   - Run: `cd apps/web && npx tsx scripts/seed-<feature>-eval.ts`

4. **Start dev server**
   ```bash
   pnpm dev
   ```

5. **Present credentials and eval checklist**
   - Print login URLs and credentials
   - Generate a checklist from the PR's test plan (if a PR exists)
   - Include both happy-path and edge-case scenarios
   - Include permission/auth boundary tests

## Output format

Print a clean summary:
```
=== MANUAL EVAL READY ===

Branch:  feat/xyz
Commit:  abc1234
Server:  http://localhost:3000

Admin:   admin@lmsplus.local / admin123!
Student: student@lmsplus.local / student123!

CHECKLIST:
[ ] Step 1 — description
[ ] Step 2 — description
...
```

## Rules
- Always reset the DB fresh — never rely on leftover state
- Seed scripts must be idempotent (safe to re-run)
- Use email/password auth for local eval (not magic links — faster iteration)
- Include both admin and student credentials for permission testing
- If the dev server is already running, say so instead of starting a second instance
