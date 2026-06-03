# Agent memory (versioned snapshot)

These are a **snapshot of Claude's cross-session memory** for this project. The
live copy lives outside the repo at
`~/.claude/projects/-home-rmaiz-projects/memory/` and is what Claude actually
reads each session; this folder is a versioned backup so the knowledge travels
with the repo and survives a machine change.

Files use frontmatter (`name` / `description` / `metadata.type`) and link to each
other with `[[name]]`. `MEMORY.md` is the index.

Canonical project knowledge is in the sibling docs (`../dev-log.md`,
`../spell-vfx.md`, `../perf-playbook.md`, etc.); these memory files are the
shorter operating notes + working-relationship context. If they ever drift,
trust the docs.
