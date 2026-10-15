-- Apply manually to existing databases before enabling profile scheduling.
ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS cooldown_until timestamptz;

CREATE TABLE IF NOT EXISTS profile_leases (
    lease_id uuid PRIMARY KEY,
    profile_id uuid NOT NULL REFERENCES profiles(profile_id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profiles_scheduler_idx
    ON profiles(enabled, auth_status, cooldown_until, last_used_at);

CREATE INDEX IF NOT EXISTS profile_leases_active_idx
    ON profile_leases(profile_id, expires_at);
