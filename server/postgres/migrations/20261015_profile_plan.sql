ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plan_type text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plan_updated_at timestamptz;
