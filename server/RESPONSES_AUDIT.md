# Responses gateway audit

Audit date: 2026-10-17.

## Production observation

The upstream path was exercised from the running API container on
`goosenest-nl1` with an existing profile and the configured Codex Responses
URL. No credentials or response contents were recorded.

- upstream negotiated HTTP/1.1 and returned HTTP 200;
- response headers arrived in about 1,412 ms in one sample;
- the first raw chunk arrived in about 643 ms in another sample;
- `response.created` arrived after about 982 ms;
- the first `response.output_text.delta` arrived after about 1,225 ms;
- `response.completed` arrived after about 1,274 ms;
- returning at `response.created` therefore removed about 244 ms from observed
  time to first downstream byte compared with waiting for text output;
- observed response metadata included `x-oai-request-id`, Codex usage/credit
  headers, cookies, Cloudflare headers, and standard security headers.

The gateway now logs headers time, first-event time, HTTP version, status,
profile, and upstream request ID. It does not log tokens, cookies, request
bodies, or response bodies.

## HTTP contract

The API owns one lifespan-scoped `httpx.AsyncClient`, enabling connection and
TLS-session reuse. Client credentials, cookies, experimental flags, and
session headers are not copied upstream. The selected profile supplies
`Authorization` and `ChatGPT-Account-Id`; only bounded ASCII
`X-Client-Request-Id` and `Idempotency-Key` values are accepted from clients.

Responses preserve application metadata such as request IDs, rate-limit
information, content type, and Codex usage headers. Hop-by-hop headers,
upstream server identity, content length, date, and `Set-Cookie` are stripped.
`Retry-After` supports both delta-seconds and HTTP-date syntax.

References:

- [HTTPX async support](https://www.python-httpx.org/async/)
- [HTTPX client pooling](https://www.python-httpx.org/advanced/clients/)
- [FastAPI lifespan](https://fastapi.tiangolo.com/advanced/events/)
- [OpenAI request IDs](https://developers.openai.com/api/reference/overview)

## Streaming and failure handling

The proxy probes complete SSE frames rather than arbitrary chunks. It releases
the response after `response.created`, a content delta, or a terminal response
event. Retryable rate-limit and capacity failures observed before release are
failed over to another eligible profile. Invalid-request and other
non-retryable events are returned to the client unchanged.

Profile/model cooldown honors the upstream `Retry-After` value and is bounded
between one second and seven days. HTTP 429 is treated as account-wide, while
HTTP 5xx and model-capacity stream failures cool down only the failing
profile/model pair. HTTP 401 expires profile authentication and forces one
token refresh before failover.

References:

- [OpenAI deployment checklist](https://developers.openai.com/api/docs/guides/deployment-checklist)
- [OpenAI streaming Responses](https://developers.openai.com/api/docs/guides/streaming-responses)

## Affinity and lifecycle

Affinity is created only from explicit conversation/session identifiers or
response/conversation IDs observed in successful upstream streams. New
requests without an identity are not persisted. Keys are SHA-256 digests, so
raw client identifiers are not stored.

Bindings default to 30 days, matching the normal Responses retention horizon.
A periodic task removes expired affinity and profile-lease rows in bounded
batches. Stream finalization uses a fresh database session, is shielded from
client-disconnect cancellation, and releases its profile lease even when
usage or affinity persistence fails.

References:

- [OpenAI conversation state](https://developers.openai.com/api/docs/guides/conversation-state)

## Deployment state

The production database observation found 2,210 expired affinity rows and 530
expired profile leases, plus no populated `subscription_expires_at` values.
Before deploying this version to an existing database, apply the equivalent
manual schema changes because this project intentionally supports only the
current `postgres/scheme.sql`, not historical runtime migrations:

```sql
ALTER TABLE profiles DROP COLUMN IF EXISTS subscription_expires_at;
CREATE INDEX IF NOT EXISTS profile_leases_expiry_idx
    ON profile_leases(expires_at);
CREATE INDEX IF NOT EXISTS chat_profile_affinity_expiry_idx
    ON chat_profile_affinity(expires_at);
DELETE FROM profile_leases WHERE expires_at <= now();
DELETE FROM chat_profile_affinity WHERE expires_at <= now();
```
