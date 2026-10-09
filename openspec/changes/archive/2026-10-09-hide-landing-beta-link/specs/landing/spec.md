## REMOVED Requirements

### Requirement: Beta entry in the top-right corner
**Reason**: The dashboard is not advertised from the landing page for now.
**Migration**: Reach the dashboard by opening `/gateways` directly. Restore the requirement when the Beta link returns.

## MODIFIED Requirements

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

### Requirement: Deflow brand system scoped to the landing page
The landing page SHALL use the Deflow brand system: Schibsted Grotesk and IBM Plex Mono, the Deflow blue and ink scales, and the `deflow.` logo. Its tokens and rules SHALL NOT change the appearance of the dashboard, checkout, or approval pages, including after client-side navigation from the landing page.

#### Scenario: No leak after navigation
- **WHEN** the visitor opens `/`, then navigates client-side to `/gateways`
- **THEN** the dashboard renders in its own typeface and colours, unchanged from a direct visit to `/gateways`

#### Scenario: Brand on the landing page
- **WHEN** the landing page renders
- **THEN** the headline is set in Schibsted Grotesk and the header shows the `deflow.` logo with alt text "Deflow"
