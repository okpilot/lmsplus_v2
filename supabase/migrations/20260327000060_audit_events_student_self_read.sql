-- GDPR Article 15: students must be able to read their own audit events
-- for data export (right of access). Previously only instructors/admins
-- could read audit_events. This policy lets students see their own rows.

CREATE POLICY "audit_read_own" ON audit_events
  FOR SELECT USING (actor_id = auth.uid());
