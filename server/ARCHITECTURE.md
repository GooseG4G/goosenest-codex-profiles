# Server architecture

## Realtime events

Domain events are appended to the `goosenest:events` Redis Stream. Each event
has a stable `event_id` and an explicit `audience` containing allowed roles
and/or user IDs. Redis 8.10 stream idempotency (`XADD IDMP`) prevents the same
producer from appending the same event twice.

Every authenticated WebSocket connection reads the stream independently. This
is deliberate fan-out: Redis consumer groups are not used because they would
divide events between clients. The server, rather than the browser, filters
events against the current session principal and periodically revalidates that
session.

The UI stores the last successfully handled stream ID in `sessionStorage` and
sends it as `after` when reconnecting. A failed event handler closes the socket
without advancing the cursor, so the event can be replayed. Logout disconnects
the stream before invalidating the session and reconnects it if logout fails. A
new browser session starts at `$`; REST responses remain the authoritative
snapshots if a cursor has fallen outside retention.

## Background-task single-flight

Profile plan refreshes, usage refreshes, and usage-reset consumption use a
Redis lease keyed by task type and resource identity. The lease value is the
Celery task ID, so concurrent API clients receive the existing task ID instead
of publishing duplicate work.

Workers verify ownership and renew the lease before execution. Owner-checked
Lua scripts prevent one task from renewing or deleting another task's lease.
The lease remains owned across Celery retries, is released after a terminal
outcome, and expires after `PROFILE_TASK_LEASE_TTL` if a worker dies.
Task bodies still perform freshness and idempotency checks because Celery
delivery is at least once.

Task results are intentionally ignored: no API reads Celery `AsyncResult`, and
the returned task ID is only the single-flight lease owner. Redis therefore
stores broker messages and leases, but no redundant result-backend records.

## Responses gateway

`api/v1/response/response.py` orchestrates authentication, reservation,
failover, and streaming. Supporting responsibilities stay in the same vertical
slice: `scheduler.py` ranks and reserves profiles, `affinity.py` owns
conversation identity and bindings, `streaming.py` parses the initial SSE
frames, and `upstream.py` owns the lifespan-scoped HTTP connection pool and
the upstream header allowlist.

The gateway starts returning bytes after the first `response.created` frame.
It forwards client `X-Client-Request-Id` and `Idempotency-Key`, replaces all
credentials with the selected profile, and strips hop-by-hop headers and
upstream cookies from the response.

Only explicit session/conversation identifiers and IDs observed in upstream
events create affinity records. Unidentified new requests do not create
unreachable random bindings. Bindings live for `PROFILE_AFFINITY_TTL_DAYS`
(30 days by default, matching the normal Responses retention window). The
`responses.state.cleanup` periodic task removes expired affinity and request
lease rows in bounded batches; stale scheduled cleanup messages expire before
the next interval.

Profile selection and lease creation happen in one PostgreSQL transaction, so
a failed reservation cannot leave `last_used_at` updated without its matching
lease. An upstream response is always closed and its lease released when an
unexpected failure happens before streaming begins.

`server/postgres/scheme.sql` is the only supported schema definition. Existing
databases are upgraded manually before deployment; the application does not
run migrations at startup.

## Vertical boundaries

HTTP/WebSocket transport, event models, authorization, and event publishing
live in the `api/v1/event` slice. Redis serialization and lease primitives
stay in the Redis integration. Profile plan and usage orchestration stay in
their respective `api/v1/profile/plan` and `api/v1/profile/usage` slices.
Generic Celery single-flight infrastructure stays in `worker`. Vue transport
lifecycle is isolated in `useEventStream`; `useProfiles` only applies domain
events to profile state.

Each API slice owns its settings and periodic maintenance. Session expiration
is enforced on reads and `sessions.expired.cleanup` removes expired rows in
up to 24 short batches of 1,000 rows each hour. Response-state cleanup uses the
same bounded-batch policy independently for leases and affinities. Application
lifespan opens PostgreSQL, initializes the configured account, then opens Redis
and the upstream HTTP pool; shutdown runs the matching cleanup callbacks in
reverse order and terminates active Codex device-auth subprocesses.

## Container and repository boundaries

The production `web` service is a one-shot static-asset loader: its multi-stage
image contains only the built bundle and copies it into the shared `web-root`
volume. Nginx starts after that service completes successfully and serves the
volume. In development, the same service name targets the Node build stage and
runs Vite continuously.

Docker build contexts exclude tests, local environments, caches, reports, and
dependency directories. Runtime state (PostgreSQL, Redis, Codex profiles,
certificates, generated web assets, and Celery state) belongs in volumes or
ignored host directories, never in Git or application image layers.
