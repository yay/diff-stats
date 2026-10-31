const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')
const temporary = mkdtempSync(join(tmpdir(), 'diff-stats-host-'))
try {
  const root = join(temporary, 'repository')
  mkdirSync(root)
  const git = (...args) => execFileSync('git', args, { cwd: root })
  git('init', '-q')
  git('config', 'user.name', 'Extension Test')
  git('config', 'user.email', 'test@example.invalid')
  git('config', 'commit.gpgsign', 'false')
  writeFileSync(join(root, 'file.txt'), 'one\ntwo\n')
  git('add', '.')
  git('commit', '-qm', 'Initial')
  const executable = process.env.VSCODE_EXECUTABLE || (process.platform === 'darwin'
    ? '/Applications/Visual Studio Code.app/Contents/MacOS/Code' : 'code')
  const result = spawnSync(executable, [
    '--wait', '--user-data-dir', join(temporary, 'profile'), '--extensions-dir', join(temporary, 'extensions'),
    '--extensionDevelopmentPath', resolve(__dirname, '..'), '--extensionTestsPath', join(__dirname, 'host'),
    '--skip-welcome', '--skip-release-notes', '--disable-workspace-trust', root
  ], { stdio: 'inherit', timeout: 90000, env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined } })
  if (result.error) throw result.error
  process.exitCode = result.status === null ? 1 : result.status
  if (process.exitCode === 0) {
    if (readFileSync(join(temporary, 'host-result'), 'utf8') !== 'passed') throw new Error('Host tests did not complete')
    console.log('VS Code extension host checks passed.')
  }
} finally {
  rmSync(temporary, { recursive: true, force: true, maxRetries: 3 })
}
