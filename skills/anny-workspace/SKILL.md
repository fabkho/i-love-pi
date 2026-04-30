---
name: anny-workspace
description: Create a paired git worktree workspace for bookings-api (backend) and anny-ui (frontend) for a feature or bugfix. Use when starting work on a new task that touches both repos. Triggers on "create workspace", "new workspace", or a CU- task ID.
---

Create a paired git worktree session for `bookings-api` (backend) and `anny-ui` (frontend), then open them in a VS Code workspace.

## Usage

```bash
~/bin/create-workspace.sh <slug>
```

**Format:** `CU-<taskId>_<feature-name>` or just `<feature-name>`

**Examples:**
- `CU-1234_booking-flow-fix`
- `dark-mode-toggle`
- `CU-5678_payment-integration --dry-run`

## What it does

1. Creates matching branches in both repos with the same name
2. Sets up git worktrees under `~/code/anny/worktrees/<slug>/`
3. Generates a `.code-workspace` file linking both repos
4. Opens the workspace in VS Code

If the workspace already exists, it reopens it.

## Repo paths

- **bookings-api**: `~/code/anny/bookings-api`
- **anny-ui**: `~/code/anny/anny-ui`
- **Worktrees**: `~/code/anny/worktrees/<slug>/`

## Branch naming

Follow the ClickUp convention: `feature/CU-<taskId>-<slug>` or `bugfix/CU-<taskId>-<slug>`
