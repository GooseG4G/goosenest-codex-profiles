CREATE EXTENSION pgcrypto;
CREATE TYPE user_role AS ENUM ('user', 'administrator');

CREATE TABLE users (
    user_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    username varchar(320) NOT NULL UNIQUE,
    nickname varchar(255) NOT NULL,
    password text NOT NULL,

    role user_role NOT NULL DEFAULT 'user',

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE devices (
    device_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

    name varchar(255) NOT NULL,
    secret text NOT NULL UNIQUE,

    enabled boolean NOT NULL DEFAULT true,

    created_at timestamptz NOT NULL DEFAULT now(),
    last_used_at timestamptz
);

CREATE TABLE sessions (
    session_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

    token_hash text NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    user_agent text,
    ip_address inet
);

CREATE TABLE profiles (
    profile_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(255) NOT NULL,
    codex_home text NOT NULL UNIQUE,
    enabled boolean NOT NULL DEFAULT true,
    auth_status varchar(32) NOT NULL DEFAULT 'pending',
    usage jsonb,
    usage_updated_at timestamptz,
    subscription_expires_at timestamptz,
    cooldown_until timestamptz,
    consecutive_failures integer NOT NULL DEFAULT 0,
    last_failure_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    last_used_at timestamptz
);

CREATE TABLE profile_leases (
    lease_id uuid PRIMARY KEY,
    profile_id uuid NOT NULL REFERENCES profiles(profile_id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE chat_profile_affinity (
    session_key text PRIMARY KEY,
    profile_id uuid NOT NULL REFERENCES profiles(profile_id) ON DELETE CASCADE,
    assigned_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    last_failure_at timestamptz
);

CREATE TABLE profile_model_health (
    profile_id uuid NOT NULL REFERENCES profiles(profile_id) ON DELETE CASCADE,
    model text NOT NULL,
    consecutive_failures integer NOT NULL DEFAULT 0,
    cooldown_until timestamptz,
    last_failure_at timestamptz,
    last_success_at timestamptz,
    PRIMARY KEY (profile_id, model)
);

CREATE INDEX devices_user_id_idx ON devices(user_id);
CREATE INDEX sessions_user_id_idx ON sessions(user_id);
CREATE INDEX sessions_expires_at_idx ON sessions(expires_at);
CREATE INDEX profiles_enabled_idx ON profiles(enabled);
CREATE UNIQUE INDEX profiles_name_unique_idx ON profiles(lower(name));
CREATE INDEX profiles_scheduler_idx
    ON profiles(enabled, auth_status, cooldown_until, last_used_at);
CREATE INDEX profile_leases_active_idx
    ON profile_leases(profile_id, expires_at);
CREATE INDEX chat_profile_affinity_profile_idx ON chat_profile_affinity(profile_id, expires_at);
CREATE INDEX profile_model_health_cooldown_idx ON profile_model_health(model, cooldown_until);
