# landing Specification

## Purpose
The public entry page of Deflow. It explains what Deflow does and in which configurations, offers the waitlist, and leads beta users into the existing dashboard.

## Requirements

### Requirement: Landing is served at the root
The landing page SHALL be served at `/` and SHALL NOT redirect to the dashboard. The landing page SHALL render without authentication and SHALL NOT load Privy.

#### Scenario: Anonymous visitor opens root
- **WHEN** a visitor with no session opens `/`
- **THEN** the landing page renders, no login prompt is shown, and no Privy script is loaded

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

### Requirement: Three proofs listed
The landing page SHALL name the three proofs of the evidence pack, each with its scope: Payment Passport (per deposit), Settlement Manifest (per withdrawal), and Audit Export (per period). Each proof SHALL list what it contains. The Payment Passport SHALL state that each recipient sees what its profile allows.

#### Scenario: Proofs present
- **WHEN** the landing page renders
- **THEN** all three proof names, their scopes, and their contents are visible, and the Payment Passport scope reads "Per deposit"

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

### Requirement: Two-paths flow diagram
The How it works section SHALL show the flow as two parallel paths. The money path runs from the payer through the merchant's contract, which holds the payment until the merchant decides, to four outcomes: credit, hold, freeze, and return. The evidence path runs through Travel Rule, checks, your rules, signed decision, and Payment Passport, to the off-ramp, the bank and the regulator. The diagram SHALL carry a text equivalent for assistive technology.

#### Scenario: Both paths visible
- **WHEN** the How it works section renders
- **THEN** the money path and the evidence path are both shown, and an "Instructs" link connects the signed decision to the contract

#### Scenario: Freeze is distinct from return
- **WHEN** the outcomes are drawn
- **THEN** freeze and return are visually distinct from each other and from credit and hold

#### Scenario: Screen reader
- **WHEN** a screen reader reaches the diagram
- **THEN** it announces a region named "How Deflow works" and reads a text summary of both paths, without reading the drawn boxes a second time

### Requirement: Header navigation
The header SHALL show the Deflow logo, anchor links to the How it works, Evidence, Control, and Pilot sections, and a "Request a pilot" button. It SHALL NOT show a Beta link or any other link to the dashboard. Every anchor link SHALL lead to a section that exists on the page. At narrow widths, the anchor links MAY be hidden, but the logo and "Request a pilot" SHALL remain.

#### Scenario: Anchor resolves
- **WHEN** the visitor clicks any header anchor link
- **THEN** the page scrolls to the matching section

#### Scenario: Narrow header
- **WHEN** the page is viewed at 390px width
- **THEN** the logo and "Request a pilot" are visible in the header

#### Scenario: No Beta link
- **WHEN** the landing page renders
- **THEN** the header contains no "Beta" link and no link to `/gateways`

### Requirement: No horizontal page scroll
The landing page SHALL scroll vertically at every viewport and SHALL NOT scroll horizontally. Where the flow diagram is wider than the viewport, it SHALL scroll horizontally inside its own container, and that container SHALL be reachable by keyboard.

#### Scenario: Phone viewport
- **WHEN** the page is viewed at 390px width
- **THEN** content stacks into one column, the document has no horizontal scroll, and the diagram scrolls inside its container

#### Scenario: Laptop viewport
- **WHEN** the page is viewed at 1280×720
- **THEN** the hero and the Payment Passport card are visible without scrolling, and the document has no horizontal scroll

### Requirement: Deflow brand system scoped to the landing page
The landing page SHALL use the Deflow brand system: Schibsted Grotesk and IBM Plex Mono, the Deflow blue and ink scales, and the `deflow.` logo. Its tokens and rules SHALL NOT change the appearance of the dashboard, checkout, or approval pages, including after client-side navigation from the landing page.

#### Scenario: No leak after navigation
- **WHEN** the visitor opens `/`, then navigates client-side to `/gateways`
- **THEN** the dashboard renders in its own typeface and colours, unchanged from a direct visit to `/gateways`

#### Scenario: Brand on the landing page
- **WHEN** the landing page renders
- **THEN** the headline is set in Schibsted Grotesk and the header shows the `deflow.` logo with alt text "Deflow"

### Requirement: Landing sections
Below the hero, the landing page SHALL show, in this order: Manifest, How it works, Evidence pack, Control ("Keys and funds stay with you."), and Pilot ("Run it on real payments for 3–4 weeks.").

#### Scenario: Sections present
- **WHEN** the visitor scrolls past the hero
- **THEN** the Manifest, How it works, Evidence pack, Control, and Pilot sections appear in that order

### Requirement: Payment Passport specimens in the hero
The hero SHALL show, under the "Request a pilot" and "How it works" buttons, a link to each Payment Passport specimen: the credited off-ramp copy and the frozen FIU copy. Each link SHALL open the PDF in a new tab, and the pair SHALL be labelled as specimens with fictional data.

#### Scenario: Hero shows both specimens
- **WHEN** the landing page renders
- **THEN** two specimen links appear under the hero buttons, labelled as specimens

#### Scenario: Opening a specimen from the hero
- **WHEN** a visitor clicks a hero specimen link
- **THEN** the matching PDF opens in a new tab and the landing page stays open

### Requirement: Payment Passport specimens in the Evidence pack
The Payment Passport card in the Evidence pack section SHALL offer the same two specimen links, opening in a new tab. The Settlement Manifest and Audit Export cards SHALL NOT show specimen links.

#### Scenario: Card shows both specimens
- **WHEN** the visitor reaches the Evidence pack section
- **THEN** the Payment Passport card contains links to the credited and the frozen specimen

#### Scenario: Other cards unchanged
- **WHEN** the Evidence pack section renders
- **THEN** the Settlement Manifest and Audit Export cards contain no specimen link

### Requirement: Specimen links are accessible and do not break layout
Each specimen link SHALL have a visible text label that names the specimen. The hero links SHALL NOT cause horizontal page scroll at 390px width and SHALL NOT push the hero buttons out of view at 1280×720.

#### Scenario: Phone viewport
- **WHEN** the page is viewed at 390px width
- **THEN** the specimen links wrap inside the hero and the document has no horizontal scroll

#### Scenario: Laptop viewport
- **WHEN** the page is viewed at 1280×720
- **THEN** the hero buttons and the specimen links are visible without scrolling
