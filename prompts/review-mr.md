---
description: Review a GitLab MR with CodeRabbit + anny-reviewer + anny-red-team in parallel. Pass an MR URL or leave empty to review the current branch diff.
---

Review the following MR/changes: $@

Run these three reviews **in parallel** using background subagents:

## 1. CodeRabbit Review
Run the CodeRabbit CLI in the repo working directory:
```bash
coderabbit review --plain --type committed
```
If a base branch is known, add `--base <branch>`. Capture the full output.

## 2. Code Quality Review (anny-reviewer)
Use the `anny-reviewer` agent definition. Focus on:
- Laravel: tenant scoping (`organization_id`), deny-by-default auth, Pint/PHPStan compliance, service factories, domain events
- Vue/Nuxt: props destructuring, `useI18n()` + `t()`, settings save pattern, async error handling, a11y
- Run `git diff` to understand what changed, then review each file against the checklist

## 3. Security Review (anny-red-team)
Use the `anny-red-team` agent definition. Hunt for:
- Unscoped tenant queries (missing `organization_id`)
- Authorizer methods not throwing by default
- `v-html` with user content
- Sensitive data in Schema public fields
- Missing validation on filter/sort params

## Synthesis

After all three complete, produce a unified report:

### 🚨 Blockers (must fix before merge)
Issues from any reviewer that block shipping.

### 🔧 Fixes (should fix)
Important but non-blocking issues. Apply fixes that are clearly correct.

### 💡 Notes
Suggestions and observations — defer or ignore as needed.

For each finding, cite the source (CodeRabbit / anny-reviewer / anny-red-team) and the file:line.
