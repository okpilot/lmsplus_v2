-- pending-removal-notice reads (summary, get_pending_removal_notices, record_exam_sitting_notice) filter by sitting + event type.
CREATE INDEX idx_audit_events_sitting_notices ON public.audit_events (resource_id, event_type)
  WHERE event_type IN ('exam_sitting.entry_auto_removed', 'exam_sitting.notice_emailed');
