# Changelog

## 1.0.0 — 2026-10-31

Initial release of Diff Stats.

- Show uncommitted Git file counts and net added/deleted lines in the status bar.
- Display “No changes” for clean repositories and open Source Control on click.
- Include saved staged, unstaged, and non-ignored untracked files.
- Follow the active editor’s repository, with Source Control selection and first-repository fallbacks.
- Configure visibility and position with `diffStats.enabled` and `diffStats.priority`.
- Include the official diff Codicon as the extension icon with bundled attribution.
- Require VS Code 1.144+ and Node.js 22+ for development; use npm for dependency management.
