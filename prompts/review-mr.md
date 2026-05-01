---
description: Run a local CodeRabbit review on the current branch. Pass extra context or leave empty.
---

Run a CodeRabbit CLI review on the current changes. $@

## Steps

1. Determine the base branch — use `main` unless specified otherwise.

2. Run CodeRabbit:
```bash
coderabbit review --plain --type committed --base main
```

3. Present the results grouped by severity. If CodeRabbit finds nothing, say so.

4. For any CRITICAL or HIGH findings, suggest concrete fixes.
