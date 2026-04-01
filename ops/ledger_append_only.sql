-- Production: application role with INSERT-only on verification_ledger (FR-07).
-- Run as superuser after migrations. Replace connection string user for the API.

-- CREATE ROLE bsss_app LOGIN PASSWORD '***';
-- GRANT CONNECT ON DATABASE bsss TO bsss_app;
-- GRANT USAGE ON SCHEMA public TO bsss_app;
-- GRANT SELECT, INSERT ON verification_ledger TO bsss_app;
-- GRANT SELECT, INSERT, UPDATE ON tfan TO bsss_app; -- adjust if TFAN is also append-only
-- REVOKE UPDATE, DELETE ON verification_ledger FROM bsss_app;
