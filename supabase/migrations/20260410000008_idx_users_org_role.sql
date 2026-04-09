-- #505: Non-partial composite index for queries that include soft-deleted users.
-- getDashboardStudents filters by (organization_id, role='student') without
-- a deleted_at IS NULL predicate when status='all', so the partial index
-- idx_users_org (WHERE deleted_at IS NULL) cannot serve it.
CREATE INDEX IF NOT EXISTS idx_users_org_role
  ON users(organization_id, role);
