# Diff Stats

**Diff Stats** shows uncommitted Git file and line counts in the VS Code status bar.

Requires VS Code 1.144 or newer.

## Git change summary

The status bar shows counts such as **1 File +34 −73**, or **No changes** when the repository is clean. Click the summary to open Source Control. Hover to see which repository is being counted.

Counts include saved staged, unstaged, and non-ignored untracked files. Each changed file is counted once; line totals compare the working tree with `HEAD`, so staging the same edit does not count it twice. Untracked text files count as additions, and binary files count toward the file total only. Repositories without an initial commit are supported. Unsaved editor buffers are excluded; counts are independent of Chat sessions.

The summary follows the active editor’s repository, falling back to the selected Source Control repository and then the first available repository. It refreshes as VS Code’s built-in Git extension reports changes. It is hidden when Git or a repository is unavailable, or a refresh fails; errors appear in the **Diff Stats** output channel.

| Setting | Default | Description |
| --- | --- | --- |
| `diffStats.enabled` | `true` | Show the Git change summary. |
| `diffStats.priority` | `1` | Position on the right side of the status bar; higher values appear farther left. |

## Development

Use Node.js 22 or newer for development. Install dependencies with `npm ci`, then run `npm run compile`. Run `npm test` for Git integration and status bar lifecycle tests. Run `npm run test:host` to check activation, Git updates, settings, and Source Control navigation in an installed VS Code instance using a temporary repository and isolated profile (set `VSCODE_EXECUTABLE` if needed). Press F5 in VS Code to inspect the extension in an Extension Development Host.

Build an installable VSIX with `npm run package`.

[MIT](LICENSE) &copy; 2022 [yay](https://github.com/yay)

Compilation emits unminified CommonJS JavaScript targeting ES2022.
