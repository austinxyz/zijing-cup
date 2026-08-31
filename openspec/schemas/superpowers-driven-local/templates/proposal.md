---
Date: {{date}}
Change: {{change}}
HAS_UI_SURFACE: <yes|no>
Requirements: docs/superpowers/specs/{{date}}-{{change}}-requirements.md
---

## Why

<1-2 sentences on the problem or opportunity. Why now?>

## What Changes

<Bullet list of changes. Be specific about new capabilities, modifications,
or removals. Mark breaking changes with **BREAKING**.>

## Capabilities

### New Capabilities

<List capabilities being introduced. Each becomes a new specs/<name>/spec.md.
Use kebab-case names. Empty if no new capabilities.>

### Modified Capabilities

<List existing capabilities whose REQUIREMENTS change (not just implementation).
Each needs a delta spec at specs/<capability>/spec.md. Check openspec/specs/
for existing names. Empty if no requirement changes.>

## Impact

<Affected code, APIs, dependencies, or systems. Bullet list of file groups.>

## Out of Scope

<Explicitly excluded. Reference future change names if known
(e.g., "deferred to future-change-name").>
