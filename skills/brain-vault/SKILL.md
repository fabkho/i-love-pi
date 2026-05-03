---
name: brain-vault
description: >
  Navigate and manage Fabian's Obsidian vault "brain". Knows the folder structure,
  frontmatter schemas, templates, naming conventions, and where every type of content
  belongs. Use when creating, moving, or finding notes in Obsidian. Triggers on
  "obsidian", "vault", "note", "daily", "book", "knowledge base", "brain".
---

# Brain Vault — Obsidian Structure Guide

Vault path: `~/Documents/private/Obsidian/brain/`

## Folder Map

| Folder | Purpose | What goes here |
|--------|---------|----------------|
| `00_inbox/` | Quick capture | Unprocessed thoughts, links, snippets. Process weekly. |
| `00_daily/YYYY/MM/` | Daily journal | One note per day: `YYYY-MM-DD.md`. Auto-filled by "Bob" with ClickUp tasks, timers, reminders. |
| `01_work/` | Active work (anny) | Project folders, 1:1 notes, feedbacks, slides. Archive to `05_archive/01_work/` when done. |
| `02_private/` | Personal | `Books/`, `Code/`, `Living/`, `Vacation/`, `Wohnen/` |
| `03_open-source/` | OSS projects | `01_nuxt/`, `02_pi-extensions/` |
| `04_knowledge-base/` | Reference/TIL | `backend/` (databases, laravel), `frontend/` (javascript, vue-nuxt), `devOps/`, `misc/` (git, macos, node, ssl) |
| `05_archive/` | Completed/old | `01_work/`, `uni/`. Move things here, don't delete. |
| `06_assets/` | Attachments | Images, PDFs. Referenced via `![[filename]]` |
| `07_templates/` | Templater templates | `Daily.md`, `Book.md`, `meetings/Meeting.md`, `newProject/{Project,Task,Notes}.md` |

## Frontmatter Schemas

### Daily note (`00_daily/`)
```yaml
created: "YYYY-MM-DD HH:mm"
tags:
  - daily
```

### Book (`02_private/Books/`)
```yaml
type: book
title: "Book Title"
author: "Author Name"
status: to-read        # to-read | reading | done | dnf
series: ""
volume: ""
started: YYYY-MM-DD
finished:
language: English
rating:                # 1-5
pages: 0
cover: "https://..."
goodreads_id: ""
date_added: YYYY-MM-DD
publisher: ""
isbn: ""
isbn13: ""
format: physical       # physical | ebook | audiobook
year_published: 0
average_rating:
tags:
  - book
```

### Work project (`01_work/`)
```yaml
created: YYYY-MM-DD
type: project
tags:
  - work
```

### Work task
```yaml
created: YYYY-MM-DD
type: task
tags:
  - work
```

### Meeting (`01_work/1_1_with_Adrian/`)
```yaml
created: YYYY-MM-DD
tags:
  - meeting
```
Filename: `DD_MM_YYYY.md`

### Knowledge article (`04_knowledge-base/`)
```yaml
created: YYYY-MM-DD
tags:
  - knowledge
```

### OSS reference (`03_open-source/`)
```yaml
title: "..."
type: reference
tags:
  - pi-extension   # or nuxt, etc.
  - reference
```

## Naming Conventions

| Content | Pattern |
|---------|---------|
| Daily notes | `YYYY-MM-DD.md` in `00_daily/YYYY/MM/` |
| Books | Book title as filename |
| 1:1 meetings | `DD_MM_YYYY.md` |
| Work projects | Descriptive name (`Admin redesign.md`) |
| Knowledge notes | Topic name (`Typescript.md`, `ORM.md`) |
| Folders | Numeric prefix: `00_`, `01_`, `02_`, etc. |

## Tags

Always in frontmatter `tags:` array, never inline. Primary tags:
- `daily`, `work`, `meeting`, `book`, `knowledge`, `reference`, `pi-extension`, `stats`

## Bases (Dynamic Views)

Four `.base` files at vault root replace MOCs:
- `Active Projects.base` — filters `01_work/`, table + card views
- `Books.base` — full library with views: All, Read, To Read, DNF, By Series, By Author, Top Rated, Library cards
- `Knowledge Index.base` — groups `04_knowledge-base/` by category
- `Open Tasks.base` — all active notes excluding archive/assets/templates

## Templates

Use Templater (`tp.date`, `tp.system.prompt`, `tp.file`). Located in `07_templates/`:
- `Daily.md` — auto-date, sections for Bob automation
- `Book.md` — interactive prompts for all book metadata
- `meetings/Meeting.md` — date + attendees
- `newProject/Project.md` — ClickUp link prompt
- `newProject/Task.md`, `newProject/Notes.md`

## Rules

1. **New content** → pick the right folder from the map above. When unsure, use `00_inbox/`.
2. **Frontmatter** → always include the schema for that content type. Never skip `created` or `tags`.
3. **Finished work** → move to `05_archive/`, don't delete.
4. **Attachments** → place in `06_assets/`, link with `![[filename]]`.
5. **No inline tags** — tags go in frontmatter only.
6. **No manual MOCs** — use Bases for dynamic views.
7. **Knowledge base** → find the right subfolder under `04_knowledge-base/`. If none fits, create one.
