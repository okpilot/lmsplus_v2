-- Drop insecure overloads of get_report_correct_options created by
-- migrations 032 (uuid[]) and 033 (uuid, uuid[]).
-- PostgreSQL CREATE OR REPLACE with different params creates overloads,
-- not replacements. The secure version (uuid only) is migration 035.
DROP FUNCTION IF EXISTS get_report_correct_options(uuid[]);
DROP FUNCTION IF EXISTS get_report_correct_options(uuid, uuid[]);
