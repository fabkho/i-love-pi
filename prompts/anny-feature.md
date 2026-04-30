---
description: Plan and implement a full-stack anny feature across bookings-api and anny-ui. Scouts both repos, identifies the API contract, plans both sides, and flags risks before writing code.
---

Plan and implement the following anny.co feature across bookings-api and anny-ui:

$@

## Steps

1. **Scout** — use `anny-scout` to explore relevant code in both repos. Identify the JSON:API resource type, endpoint, include paths, and affected UI models.

2. **Plan** — use `anny-planner` to create an ordered implementation plan covering:
   - bookings-api changes (Schema/Adapter/Validators/Authorizer, Service, migrations, tests)
   - anny-ui changes (models, composables, components, i18n keys)
   - Cross-repo API contract (endpoint, JSON:API type, attributes, relationships, includes)

3. **Review the plan** — use `anny-plan-reviewer` to catch missing tenant scoping, auth gaps, or Vue convention violations before coding starts.

4. **Confirm** — summarize the plan and flag any open decisions that need input before proceeding.
