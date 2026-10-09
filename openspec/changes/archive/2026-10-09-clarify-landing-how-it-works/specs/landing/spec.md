# Spec Delta

## MODIFIED Requirements

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
