# Spec Delta

## MODIFIED Requirements

### Requirement: Every projection issue is logged
Each projection SHALL be recorded with the profile, `prepared_for`, purpose, `projection_hash`, issue time and issuer. The issuer SHALL be the session's address when a staff session issued the projection, and `api-token` when the bearer token did. Records made before issuers were recorded SHALL read as `api-token`. The recipient fields SHALL appear in the projection itself.

#### Scenario: Audit of disclosures
- **WHEN** an `OFF_RAMP` projection is issued to "Example Exchange" for a source-of-funds request
- **THEN** a projection record with that recipient, purpose and hash exists

#### Scenario: Issued by an officer
- **WHEN** an officer signed in to the console issues a projection
- **THEN** the projection record names the officer's address as issuer

## ADDED Requirements

### Requirement: Projection log is readable
Processor staff SHALL be able to list projection records, newest first, filtered by payment reference or pack id. Each entry SHALL carry the payment reference, pack id and version, profile, `prepared_for`, purpose, `projection_hash`, issue time and issuer. The list SHALL be paginated.

#### Scenario: Disclosures of one payment
- **WHEN** staff list projections for a payment that had two copies issued
- **THEN** both records are returned, newest first, with their issuers

#### Scenario: Unknown payment
- **WHEN** staff list projections for a payment reference with no packs
- **THEN** the response is an empty list
