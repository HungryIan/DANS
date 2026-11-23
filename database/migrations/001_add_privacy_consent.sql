-- Migration 001 (2026-11-21): record when a resident agreed to the DANS privacy notice (Data Privacy Act of 2012).
--
-- The API applies this change automatically on start-up (backend/Dans.Api/Data/SchemaUpgrades.cs) and skips it when
-- the column already exists. Run it by hand only if you manage the database yourself. Back up the database first.
-- Existing accounts keep an empty value; new registrations must accept the privacy notice.

-- ---------- SQLite (default; file backend/Dans.Api/dans.db) ----------
-- Check first:  SELECT COUNT(*) FROM pragma_table_info('Users') WHERE name = 'PrivacyConsentAt';   -- 0 = not applied yet
ALTER TABLE "Users" ADD COLUMN "PrivacyConsentAt" TEXT NULL;

-- ---------- SQL Server (when Database:Provider = SqlServer) ----------
-- IF COL_LENGTH('Users', 'PrivacyConsentAt') IS NULL
--     ALTER TABLE [Users] ADD [PrivacyConsentAt] datetime2 NULL;
