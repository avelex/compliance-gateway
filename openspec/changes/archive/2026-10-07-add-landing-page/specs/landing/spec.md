# Spec Delta

## Purpose

The public entry page of Deflow. It explains what Deflow does and in which configurations, offers the waitlist, and leads beta users into the existing dashboard.

## ADDED Requirements

### Requirement: Landing is served at the root
The landing page SHALL be served at `/` and SHALL NOT redirect to the dashboard. The landing page SHALL render without authentication and SHALL NOT load Privy.

#### Scenario: Anonymous visitor opens root
- **WHEN** a visitor with no session opens `/`
- **THEN** the landing page renders, no login prompt is shown, and no Privy script is loaded

### Requirement: Beta entry in the top-right corner
The landing page SHALL show a "Beta" control in the top-right corner of the header that navigates to the dashboard (`/gateways`). From there the existing login, setup, and dashboard flow applies unchanged.

#### Scenario: Signed-out visitor clicks Beta
- **WHEN** a visitor without a session clicks "Beta"
- **THEN** they reach the dashboard's sign-in screen

#### Scenario: Signed-in merchant clicks Beta
- **WHEN** a merchant with a session and a completed setup clicks "Beta"
- **THEN** they reach the gateways page

### Requirement: Core message from the one-pager
The landing page SHALL state the promise: a check before funds are credited, and a proof for every payment and every withdrawal. It SHALL name the audience: MiCA-authorised processors and small exchanges accepting USDC or EURC on EVM networks. It SHALL show the payment flow: checkout, contract, Deflow checks, decision signed by the processor, then credit to the pool, freeze, or refund.

#### Scenario: Flow outcomes visible
- **WHEN** the landing page renders
- **THEN** the three outcomes, credit to the pool, freeze, and refund, are shown as distinct steps after the processor's decision

#### Scenario: Custody statement
- **WHEN** the landing page describes the decision
- **THEN** it states that the processor signs with its own key and that Deflow neither signs transactions nor holds funds

### Requirement: Three proofs listed
The landing page SHALL name the three proofs of the evidence pack, each with its scope: Payment Passport (per payment), Settlement Manifest (per withdrawal), and Audit Export (per period).

#### Scenario: Proofs present
- **WHEN** the landing page renders
- **THEN** all three proof names and their scopes are visible

### Requirement: Configurations explained
The landing page SHALL present the two configurations a merchant can choose: (a) contracts + recommendations + evidence pack, and (b) recommendations + evidence pack without contracts.

#### Scenario: Both configurations shown
- **WHEN** the landing page renders
- **THEN** configuration (a) and configuration (b) are both described, and it is clear which one includes contracts

### Requirement: External waitlist link
The landing page SHALL offer a waitlist call to action that opens the external form configured in `NEXT_PUBLIC_WAITLIST_URL` in a new tab. Deflow SHALL NOT collect or store waitlist data. When the URL is not configured, the waitlist call to action SHALL NOT be rendered.

#### Scenario: Waitlist configured
- **WHEN** `NEXT_PUBLIC_WAITLIST_URL` is set and the visitor clicks the waitlist call to action
- **THEN** the external form opens in a new tab

#### Scenario: Waitlist not configured
- **WHEN** `NEXT_PUBLIC_WAITLIST_URL` is empty or unset
- **THEN** no waitlist call to action is rendered and the rest of the page is unaffected

### Requirement: Single screen without scrolling
At viewports of at least 1280×720 CSS pixels, the landing page SHALL fit without vertical or horizontal scrolling. Below the `md` breakpoint, the page MAY scroll vertically but SHALL NOT scroll horizontally.

#### Scenario: Laptop viewport
- **WHEN** the page is viewed at 1280×720
- **THEN** all content is visible with no scrollbar

#### Scenario: Phone viewport
- **WHEN** the page is viewed at 390px width
- **THEN** content stacks into one column with no horizontal scroll

### Requirement: Dashboard design system only
The landing page SHALL use only the existing design tokens and typefaces (Archivo and IBM Plex Mono). It SHALL follow the system's rules: no cards or shadows, `wash` as the only fill, no alert red, and no animation beyond the existing `breathe`.

#### Scenario: Freeze step styling
- **WHEN** the freeze outcome is drawn in the flow
- **THEN** it is distinguished by form or texture (for example `.hatch`), not by `alert` color
