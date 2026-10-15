ALTER TABLE profiles ADD COLUMN IF NOT EXISTS consecutive_failures integer NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_failure_at timestamptz;
