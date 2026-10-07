# Spec Delta

## Purpose

Lets an authorized operator revoke a person's attestations by nullifier. One request stops every wallet that person used at that merchant.

## ADDED Requirements

### Requirement: Signed HTTP trigger
The workflow SHALL expose a CRE HTTP trigger that accepts only requests signed by the configured EVM revocation signer key. This handler runs on the DON outside the TEE.

#### Scenario: Unsigned request
- **WHEN** a request is not signed by the configured revocation key
- **THEN** CRE rejects it and no report is written

### Requirement: Revoke by nullifier
A request body `{"nullifier": "0x…"}` SHALL produce one registry report. The report carries a single revoke entry for that nullifier and the current runtime time as the heartbeat. A body that is not valid JSON SHALL fail without writing.

#### Scenario: Successful revocation
- **WHEN** a signed request carries a nullifier
- **THEN** the registry marks that nullifier revoked and `isValid` turns false for every wallet attested with it

#### Scenario: Malformed body
- **WHEN** the request body is not valid JSON
- **THEN** the handler returns an error and writes nothing
