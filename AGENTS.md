# Issue tracker
This project tracks work in **YouTrack**, at https://issues.bloomlibrary.org/youtrack (Kanban
boards). Ticket ids look like **`BL-16572`** (`BL-` plus a number). The skill that talks to it is
**`youtrack-api`**. Use it for every tracker operation: reading an issue, finding the id for the
current work, listing or posting comments, and setting an issue's State. The higher-level
`youtrack-*` skills build on it.

To find the ticket id for the branch you are on, look for a `BL-XXXXX` token in the branch name.
Not every branch has a card. Small cleanups and tooling work are often done without one, so
finding no id is a normal outcome and not a reason to go hunting.

Team-wide workflow skills that are not specific to this repo (the preflight → self-review →
peer-review pipeline, Devin and Reviewable review handling, YouTrack operations) live in
https://github.com/BloomBooks/bloom-team-skills. Install them per its README (clone + symlink
into `~/.claude/skills`).
