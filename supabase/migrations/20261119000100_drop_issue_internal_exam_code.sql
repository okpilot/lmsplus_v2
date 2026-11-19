-- The legacy per-student issue RPC is retired; codes come from sittings only.
DROP FUNCTION IF EXISTS public.issue_internal_exam_code(uuid, uuid);
