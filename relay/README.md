# relay

Two route handlers, no service. No PII, no on-chain signing, no state beyond an in-memory queue.
See `../relay-spec.md` for the full spec.

## Routes

- `POST /api/relay/token` — mints a Sumsub WebSDK access token for `{gate, wallet}`. Creates the
  applicant (idempotently) under a HMAC'd `sessionUserId`, never the raw wallet, then mints.
- `POST /api/relay/queue` — checkout enqueues `{kind, gate, wallet, level}`. Dedup'd by
  `(gate, wallet)`, 90s TTL, no ack.
- `GET /api/relay/queue?minute=<unix-minute>` — enclave drains via cron, `Authorization: Bearer
  RELAY_FETCH_TOKEN`. Read-only, deterministic ordering.

## Setup

```
cp .env.example .env
npm install
npm run dev
```

## Hosting constraint

The queue is a `Map` in process memory — one long-lived process required, reachable from the DON
(not pure serverless, not `localhost`). Deploy target is decided outside this repo.
