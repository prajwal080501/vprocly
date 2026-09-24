-- Application role: RLS applies to it (no BYPASSRLS, not table owner).
CREATE ROLE vprocly_app LOGIN PASSWORD 'vprocly_app';
GRANT CONNECT ON DATABASE vprocly TO vprocly_app;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
