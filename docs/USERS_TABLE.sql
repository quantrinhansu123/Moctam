-- Users table for Mộc Tâm admin login (and future buyers).
-- Run in Supabase SQL Editor (same project as SUPABASE_URL).

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(80),
  email VARCHAR(255),
  password_hash TEXT,
  role VARCHAR(20) NOT NULL DEFAULT 'Buyer',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(80);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Existing projects may require email NOT NULL — seed uses adminmoctam@moctam.local
UPDATE users SET role = 'Buyer' WHERE role IS NULL OR role = '';
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'Buyer';

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower
  ON users (lower(username))
  WHERE username IS NOT NULL AND username <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower
  ON users (lower(email))
  WHERE email IS NOT NULL AND email <> '';

-- Backend seeds adminmoctam on startup if missing.
-- You can also insert manually later (password_hash must be scrypt$... from the API).

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Service role (backend) bypasses RLS. Keep policies tight for anon.
DROP POLICY IF EXISTS "users_no_anon_select" ON users;
DROP POLICY IF EXISTS "users_no_anon_write" ON users;

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'users'
ORDER BY ordinal_position;
