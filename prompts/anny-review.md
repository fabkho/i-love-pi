---
description: Full review of current changes — code quality, anny conventions, tenant isolation, and security. Pass a description or leave empty to review the current git diff.
---

Review the current changes$@.

Run in parallel:

1. **Code review** (`anny-reviewer`) — check Laravel conventions (tenant scoping, deny-by-default auth, Pint/PHPStan) and Vue conventions (props reactivity, i18n, a11y).

2. **Security review** (`anny-red-team`) — hunt for tenant isolation gaps, unscoped queries, missing auth, and frontend XSS risks.

Synthesize findings: list blockers first, then important fixes, then notes. Apply fixes that are clearly correct; flag anything that needs a decision.
