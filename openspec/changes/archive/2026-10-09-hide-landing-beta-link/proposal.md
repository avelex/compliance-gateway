# Proposal

## Why

The dashboard behind the landing header's "Beta" link is not ready to be advertised publicly. The landing page should stop pointing visitors at it for now.

## What Changes

- Remove the "Beta" link from the landing header. The header keeps the logo, anchor links, and "Request a pilot".
- Remove the "Beta entry in the top-right corner" requirement from the landing spec; update the header and brand-isolation requirements that mention Beta.
- Remove the now-unused `.tag` style.
- `/gateways` itself is untouched and stays reachable by direct URL.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `landing`: header no longer contains a Beta link; the Beta entry requirement is removed.

## Impact

- `frontend/app/page.tsx` (header), `frontend/app/landing.module.css` (`.tag`).
- No API, dependency, or dashboard changes.
- Reversible: restoring the link is a revert of this change.
- Out of scope: the landing spec Purpose line mentions "beta users"; left as is.
