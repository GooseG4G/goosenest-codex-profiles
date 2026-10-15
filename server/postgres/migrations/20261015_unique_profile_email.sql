-- Apply manually to an existing database before deploying this release.
-- The statement fails without changing anything if duplicate emails already exist.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_name_unique_idx
    ON profiles(lower(name));
