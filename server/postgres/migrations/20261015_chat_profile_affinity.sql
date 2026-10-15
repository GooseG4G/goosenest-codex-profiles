CREATE TABLE IF NOT EXISTS chat_profile_affinity (
    session_key text PRIMARY KEY,
    profile_id uuid NOT NULL REFERENCES profiles(profile_id) ON DELETE CASCADE,
    assigned_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    last_failure_at timestamptz
);
CREATE INDEX IF NOT EXISTS chat_profile_affinity_profile_idx
    ON chat_profile_affinity(profile_id, expires_at);
