-- 00_extensions — enable Postgres extensions used across v2 schema.
-- pg_trgm: trigram indexes for fuzzy name/text search (StudentImport dedup heuristic).
-- pgcrypto: gen_random_uuid + hashing helpers used by audit log + identifier hashing.

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
