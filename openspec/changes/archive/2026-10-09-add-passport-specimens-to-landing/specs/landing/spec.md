## ADDED Requirements

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
