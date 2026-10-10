# Spec Delta

## MODIFIED Requirements

### Requirement: API is authenticated
Every API endpoint, except the sign-in endpoints, SHALL require either the configured bearer token or a valid staff session, and SHALL return 401 without one. The bearer token is for service callers. A staff session belongs to one address in the officer or MLRO set. Responses for checkout or payer audiences are out of scope. Case and payment endpoints are for processor staff only.

#### Scenario: Missing token
- **WHEN** `GET /v1/cases` is called without a bearer token or a session
- **THEN** the response is 401

#### Scenario: Staff session
- **WHEN** `GET /v1/cases` is called with a valid session of a configured officer
- **THEN** the response is 200

#### Scenario: Address removed from the configuration
- **WHEN** a session exists for an address that is no longer an officer or an MLRO after the service restarts
- **THEN** requests with that session return 401

#### Scenario: Address added back before expiry
- **WHEN** that address is added back to the configuration and the service restarts before the session expires
- **THEN** requests with the old session are accepted again

## ADDED Requirements

### Requirement: Staff sign in with Ethereum
The service SHALL issue a single-use EIP-4361 sign-in message with a fresh nonce, the configured console origin as domain and URI, and a short expiry. It SHALL open a session only for a `personal_sign` signature over exactly that message whose signer is in the officer or MLRO set. Sign-in SHALL be disabled when no console origin is configured.

#### Scenario: Officer signs in
- **WHEN** a configured officer returns a valid signature over an issued, unexpired message
- **THEN** the service opens a session for that address and sets it as an HttpOnly, Secure, SameSite=Strict cookie

#### Scenario: Nonce reused
- **WHEN** a signature over a message whose nonce was already used is submitted
- **THEN** the response is 401 and no session is opened

#### Scenario: Unknown signer
- **WHEN** the signature recovers to an address outside the officer and MLRO sets
- **THEN** the response is 403 and no session is opened

### Requirement: Sign-in nonces are bounded
Unused sign-in nonces SHALL NOT accumulate. The number held at once SHALL be bounded, and at the bound the service SHALL refuse new nonces with 503 instead of storing more.

#### Scenario: Nonce flood
- **WHEN** unauthenticated callers request nonces faster than they expire and the bound is reached
- **THEN** further nonce requests return 503, and existing sessions keep working

### Requirement: Session reports the staff role
The service SHALL return, for the current session, the address, the officer id and mask when the address is an officer, and whether it is an MLRO. It SHALL also return the configured chains with the token symbols recorded on each.

#### Scenario: Officer and MLRO
- **WHEN** an address that is both an officer with mask 15 and an MLRO reads its session
- **THEN** the response carries its officer id, mask 15 and `mlro: true`

### Requirement: Sessions expire and can be ended
A session SHALL expire after the configured session lifetime. Sign-out SHALL end the session at once. The service SHALL store only a hash of the session token.

#### Scenario: Sign-out
- **WHEN** a staff member signs out and the old cookie is sent again
- **THEN** the response is 401

### Requirement: Session writes are same-origin
A state-changing request authenticated by a session SHALL be accepted only when its `Origin` header equals the configured console origin. Bearer-token requests are not subject to this check.

#### Scenario: Cross-site post
- **WHEN** a session-authenticated POST arrives with an `Origin` other than the console origin
- **THEN** the response is 403 and nothing is recorded

### Requirement: Officer decisions match the session
When an officer decision is submitted with a session, the signature's recovered signer SHALL equal the session's address, or the decision SHALL be rejected with 403. Decisions submitted with the bearer token keep the existing check against the officer set only.

#### Scenario: Signature by another officer
- **WHEN** officer A's session submits a decision signed by officer B
- **THEN** the response is 403 and no decision is recorded

### Requirement: Officer decisions refuse orphaned payments
The service SHALL refuse to issue typed data for, or record, an officer decision on a payment whose ingest status is `orphaned`, with 409, for session and bearer-token callers alike.

#### Scenario: Payment orphaned after confirmation
- **WHEN** a confirmed payment with a pack is later orphaned by a reorg and an officer requests typed data or submits a decision for it
- **THEN** the response is 409 and no decision is recorded
