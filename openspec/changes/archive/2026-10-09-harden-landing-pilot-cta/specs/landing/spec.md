# Spec Delta

## MODIFIED Requirements

### Requirement: Core message
The landing page SHALL state the promise: a proof for every deposit and every withdrawal. It SHALL describe Deflow as an evidence layer for stablecoin deposits that gives regulated crypto businesses a signed proof of how each deposit was checked and decided. It SHALL name the audience: processors, exchanges, off-ramps and custodians. The hero SHALL show a sample Payment Passport card, captioned as a sample with illustrative names, addresses and hashes.

#### Scenario: Promise and audience visible
- **WHEN** the landing page renders
- **THEN** the headline "A proof for every deposit and every withdrawal." is shown, followed by the evidence-layer description, the audience line, and the sample Payment Passport card with its sample caption

#### Scenario: Flow outcomes visible
- **WHEN** the How it works section renders
- **THEN** credit, hold, freeze, and return are shown as four distinct outcomes of the contract

#### Scenario: Custody statement
- **WHEN** the landing page describes the decision
- **THEN** it states that the decision is signed by the merchant's officer or by the merchant's policy key under rules the MLRO approved, and that Deflow neither signs transactions nor holds funds

### Requirement: External waitlist link
The pilot request card SHALL offer a "Send request" call to action. When `NEXT_PUBLIC_WAITLIST_URL` is set, it SHALL open that external form in a new tab. Otherwise, when `NEXT_PUBLIC_PILOT_EMAIL` is set, it SHALL open a pre-filled email to that address. Deflow SHALL NOT collect or store pilot or waitlist data. When neither is configured, the request card and every "Request a pilot" button SHALL NOT be rendered.

#### Scenario: Waitlist configured
- **WHEN** `NEXT_PUBLIC_WAITLIST_URL` is set and the visitor clicks "Send request"
- **THEN** the external form opens in a new tab

#### Scenario: Email fallback
- **WHEN** `NEXT_PUBLIC_WAITLIST_URL` is unset, `NEXT_PUBLIC_PILOT_EMAIL` is set, and the visitor clicks "Send request"
- **THEN** a pre-filled email to that address opens, asking for work email, company and CASP licence country

#### Scenario: Waitlist not configured
- **WHEN** both `NEXT_PUBLIC_WAITLIST_URL` and `NEXT_PUBLIC_PILOT_EMAIL` are empty or unset
- **THEN** no "Request a pilot" button and no request card are rendered, and the rest of the page is unaffected
