---
name: prod-debug
description: >
  Query the anny production database to inspect live data for bug investigation.
  Use when a bug cannot be reproduced locally and you need to check actual
  resource/booking/service data on prod. Triggers on "check prod", "prod data",
  "query prod", "debug prod", "can't reproduce", or /skill:prod-debug.
---

# Production Database Debugging

Run ad-hoc read-only queries against the anny production database via Laravel Tinker.

## Prerequisites

- VPN must be connected (ask the user to enable it if the connection times out)
- Credentials file must exist at `~/.pi/anny-prod.json` (see setup below)
- Backend repo must be available at `/Users/fabiankirchhoff/code/anny/bookings-api`

## Credentials Setup

Credentials are stored locally at `~/.pi/anny-prod.json` — never in this repo. Ask Adrian for values.

```json
{
  "host": "...",
  "database": "...",
  "username": "...",
  "password": "...",
  "app_key": "base64:..."
}
```

## Usage

1. Read credentials from `~/.pi/anny-prod.json`
2. Write a `.tinker.php` script in the backend repo's `.tinker/` directory using the template in `references/prod_debugger_template.tinker.php`
3. Fill in the connection block with values from the credentials file
4. Run it with `php artisan tinker <script>` (timeout 30s)
5. **Delete the script when done**

## Running

```bash
cd /Users/fabiankirchhoff/code/anny/bookings-api
php artisan tinker .tinker/my_debug_script.tinker.php
```

## Rules

- **Read-only.** Never write, update, or delete production data.
- **Clean up.** Delete the tinker script after use.
- **Targeted queries.** No `SELECT *` on large tables.
- **Key tables:** `resources`, `services`, `bookings`, `organizations`, `users`, `addresses`, `resource_categories`, `resource_groups`, `schedules`, `schedule_groups`
- Models use **SoftDeletes** — rows with `deleted_at IS NOT NULL` are soft-deleted.
- The `ActivePlatformScope` scopes by `platform_id`. Raw DB queries bypass this.
