CREATE TABLE IF NOT EXISTS profile_model_health (
    profile_id uuid NOT NULL REFERENCES profiles(profile_id) ON DELETE CASCADE,
    model text NOT NULL,
    consecutive_failures integer NOT NULL DEFAULT 0,
    cooldown_until timestamptz,
    last_failure_at timestamptz,
    last_success_at timestamptz,
    PRIMARY KEY (profile_id, model)
);
CREATE INDEX IF NOT EXISTS profile_model_health_cooldown_idx
    ON profile_model_health(model, cooldown_until);
