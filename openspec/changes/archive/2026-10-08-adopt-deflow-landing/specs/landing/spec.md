# Spec Delta

## RENAMED Requirements

- FROM: `### Requirement: Core message from the one-pager`
- TO: `### Requirement: Core message`

## MODIFIED Requirements

### Requirement: Core message
The landing page SHALL state the promise: a proof for every deposit and every withdrawal. It SHALL describe Deflow as an evidence layer for stablecoin deposits that gives regulated crypto businesses a signed proof of how each deposit was checked and decided. It SHALL name the audience: processors, exchanges, off-ramps and custodians.

#### Scenario: Promise and audience visible
- **WHEN** the landing page renders
- **THEN** the headline "A proof for every deposit and every withdrawal." is shown, followed by the evidence-layer description and the audience line naming processors, exchanges, off-ramps and custodians

#### Scenario: Flow outcomes visible
- **WHEN** the landing page renders with "With contracts" selected
- **THEN** credit to your pool, hold, freeze, and return to payer are shown as four distinct outcomes that follow the signed decision

#### Scenario: Custody statement
- **WHEN** the landing page describes the decision
- **THEN** it states that the decision is signed by the merchant's officer or made under the merchant's rules, and that Deflow neither signs transactions nor holds funds

### Requirement: Three proofs listed
The landing page SHALL name the three proofs of the evidence pack, each with its scope: Payment Passport (per deposit), Settlement Manifest (per withdrawal), and Audit Export (per period).

#### Scenario: Proofs present
- **WHEN** the landing page renders
- **THEN** all three proof names and their scopes are visible, and the Payment Passport scope reads "per deposit"

### Requirement: Configurations explained
The landing page SHALL present the two configurations as a single-choice control: "Without contracts" and "With contracts". Each option SHALL carry its description. "With contracts" SHALL be selected when the page loads. The flow diagram SHALL follow the selected option.

#### Scenario: Both configurations shown
- **WHEN** the landing page renders
- **THEN** both options are shown with their descriptions, "With contracts" is selected, and it is clear which one includes contracts

#### Scenario: Visitor switches configuration
- **WHEN** the visitor selects "Without contracts"
- **THEN** the diagram's money path shows "No contract" and "Funds move as they do today", and the four outcomes are drawn as inactive

#### Scenario: Keyboard selection
- **WHEN** the visitor reaches the configuration control with the keyboard
- **THEN** each option is focusable, shows a visible focus ring, and exposes its checked state to assistive technology

## REMOVED Requirements

### Requirement: Single screen without scrolling
**Reason**: The Deflow design adds Problem, Why, How and Not-claims sections below the fold. Its fold alone is taller than 720px.
**Migration**: Replaced by "No horizontal page scroll". The page scrolls vertically at every viewport.

### Requirement: Dashboard design system only
**Reason**: The landing page adopts the Deflow brand system from the design export. The dashboard keeps its own system until a separate change moves it.
**Migration**: Replaced by "Deflow brand system scoped to the landing page".

## ADDED Requirements

### Requirement: Two-paths flow diagram
The landing page SHALL show the flow as two parallel paths. The money path runs from the payer's personal address through the merchant's contract to four outcomes: credit to your pool, hold, freeze, and return to payer. The evidence path runs through Travel Rule, checks, your rules, signed decision, and Payment Passport, to the off-ramp or bank and the regulator.

#### Scenario: Both paths visible
- **WHEN** the landing page renders with "With contracts" selected
- **THEN** the money path and the evidence path are both shown, and a "Releases" link connects the signed decision to the contract

#### Scenario: Freeze is distinct from return
- **WHEN** the outcomes are drawn
- **THEN** freeze and return to payer are visually distinct from each other and from credit and hold

### Requirement: Explanatory sections
Below the fold, the landing page SHALL show, in this order: Problem, as a Today and With Deflow comparison with four rows; Why Deflow, with three numbered points; How it works, covering who decides and quiet freezes; and What Deflow does not claim, with four points.

#### Scenario: Sections present
- **WHEN** the visitor scrolls past the fold
- **THEN** the Problem, Why Deflow, How it works, and What Deflow does not claim sections appear in that order

#### Scenario: Quiet freeze explained
- **WHEN** the How it works section renders
- **THEN** it states that a freeze looks like any other check in progress on-chain, and that a frozen deposit can never be sent back to the payer

### Requirement: Header navigation
The header SHALL show the Deflow logo, anchor links to the Problem, Why Deflow, How it works, and Evidence pack sections, and the Beta link. Every anchor link SHALL lead to a section that exists on the page. Below 1000px width, the anchor links MAY be hidden, but the logo and Beta SHALL remain.

#### Scenario: Anchor resolves
- **WHEN** the visitor clicks any header anchor link
- **THEN** the page scrolls to the matching section

#### Scenario: Narrow header
- **WHEN** the page is viewed at 390px width
- **THEN** the logo and Beta are visible in the header

### Requirement: No horizontal page scroll
The landing page SHALL scroll vertically at every viewport and SHALL NOT scroll horizontally. Where the flow diagram is wider than the viewport, it SHALL scroll horizontally inside its own container, and that container SHALL be reachable by keyboard.

#### Scenario: Phone viewport
- **WHEN** the page is viewed at 390px width
- **THEN** content stacks into one column, the document has no horizontal scroll, and the diagram scrolls inside its container

#### Scenario: Laptop viewport
- **WHEN** the page is viewed at 1280×720
- **THEN** the hero and the diagram are visible without scrolling, and the document has no horizontal scroll

### Requirement: Deflow brand system scoped to the landing page
The landing page SHALL use the Deflow brand system: Schibsted Grotesk and IBM Plex Mono, the Deflow blue and ink scales, and the `deflow.` logo. Its tokens and rules SHALL NOT change the appearance of the dashboard, checkout, or approval pages, including after client-side navigation from the landing page.

#### Scenario: No leak after navigation
- **WHEN** the visitor opens `/`, then clicks Beta and reaches `/gateways`
- **THEN** the dashboard renders in its own typeface and colours, unchanged from a direct visit to `/gateways`

#### Scenario: Brand on the landing page
- **WHEN** the landing page renders
- **THEN** the headline is set in Schibsted Grotesk and the header shows the `deflow.` logo with alt text "Deflow"
