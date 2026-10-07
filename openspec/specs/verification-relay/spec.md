# verification-relay Specification

## Purpose
A minimal HTTP relay between the payer's browser and the enclave. It mints Sumsub WebSDK tokens without exposing the Sumsub secret, and it holds a short-lived verification queue for the enclave to drain. It never sees PII and signs nothing on-chain.

## Requirements

### Requirement: Session user id is a keyed HMAC of gate and wallet
The relay SHALL identify a payer to Sumsub as `"cg-" + hex(HMAC-SHA256(key, lower(gate) + lower(wallet)))`. The key SHALL be the ASCII bytes of `SESSION_ID_SECRET` exactly as written in the environment, without hex-decoding. The wallet address SHALL never be sent to Sumsub.

#### Scenario: Shared test vector
- **WHEN** the secret is `0000000000000000000000000000000000000000000000000000000000000001`, gate is `0x1111111111111111111111111111111111111111`, and wallet is `0x2222222222222222222222222222222222222222`
- **THEN** the id is `cg-56d8d509b470b54522139d08662a235739f4e7682216bd09758b301c59571749`

### Requirement: Token minting creates the applicant first
`POST /api/relay/token` with `{gate, wallet}` SHALL first create a Sumsub applicant under the session user id at the configured level, treating "already exists" or 409 as success. It SHALL then mint an access token with a 600-second TTL and respond `200 {token}`.

#### Scenario: Returning payer
- **WHEN** the applicant already exists
- **THEN** the relay still mints and returns a token

#### Scenario: Sumsub failure
- **WHEN** applicant creation or token minting fails
- **THEN** the relay responds `502 {"error": "Verification provider is unavailable."}`

### Requirement: Token endpoint validates input and rate-limits
The token endpoint SHALL respond `400` when `gate` or `wallet` is not an address. It SHALL rate-limit by client IP (first `x-forwarded-for` hop) to 5 requests per rolling hour, responding `429` when the limit is exceeded. The limiter is process-local and demo-grade.

#### Scenario: Sixth mint in an hour
- **WHEN** one IP calls the token endpoint for the sixth time within an hour
- **THEN** the relay responds `429`

### Requirement: Enqueue is deduplicated with a short TTL
`POST /api/relay/queue` with `{kind, gate, wallet, level}` SHALL store one entry per lower-cased `(gate, wallet)`, replacing any earlier entry. It SHALL stamp the entry with the relay's own `enqueuedAt` and respond `202 {}`. Entries SHALL expire 90 seconds after `enqueuedAt`. No acknowledgement endpoint exists.

#### Scenario: Re-enqueue replaces
- **WHEN** the same pair is enqueued twice
- **THEN** the queue holds one entry carrying the later `enqueuedAt`

#### Scenario: Missing field
- **WHEN** any of `kind`, `gate`, `wallet`, `level` is missing, or an address is invalid
- **THEN** the relay responds `400`

### Requirement: Drain returns a deterministic start-of-minute snapshot
`GET /api/relay/queue?minute=N` SHALL require `Authorization: Bearer <RELAY_FETCH_TOKEN>` and respond `401` otherwise. It SHALL return `{minute, items}` with the unexpired entries where `enqueuedAt < N*60`, sorted by `(gate, wallet)`. Reading SHALL NOT remove live entries.

#### Scenario: Entry enqueued in the current minute
- **WHEN** an entry was enqueued after the start of minute N
- **THEN** it is absent from the snapshot for minute N

#### Scenario: Missing minute
- **WHEN** the `minute` parameter is absent or not a number
- **THEN** the relay responds `400`

### Requirement: Relay keeps no state beyond process memory
The relay SHALL keep its queue and rate-limit counters only in process memory, with no database. It therefore requires a single long-lived process that the DON can reach.

#### Scenario: Restart
- **WHEN** the relay process restarts
- **THEN** the queue is empty and browsers repopulate it on their next enqueue
