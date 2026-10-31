import { ChildProcess, execFile } from 'child_process'
import { join } from 'path'

export interface ChangeSummary {
  files: number
  insertions: number
  deletions: number
}

// One runner per refresh: cancelling a refresh also stops its Git processes.
export class GitRunner {
  private children = new Set<ChildProcess>()
  private disposed = false

  constructor(private executable: string, private cwd: string) {}

  run(args: string[], allowedExitCodes: number[] = [], input = ''): Promise<string> {
    if (this.disposed) return Promise.reject(new Error('Git refresh cancelled'))
    return new Promise((resolve, reject) => {
      const child = execFile(this.executable, args, {
        cwd: this.cwd, encoding: 'utf8', timeout: 15000, maxBuffer: 32 * 1024 * 1024,
        env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' }
      }, (error, stdout) => {
        this.children.delete(child)
        if (error && (error.killed || !allowedExitCodes.includes(Number(error.code)))) reject(error)
        else resolve(stdout)
      })
      this.children.add(child)
      child.stdin?.on('error', () => {})
      child.stdin?.end(input)
    })
  }

  dispose() {
    this.disposed = true
    this.children.forEach(child => child.kill())
    this.children.clear()
  }
}

function addNumstat(summary: ChangeSummary, output: string) {
  const records = output.split('\0')
  for (let i = 0; i < records.length; i++) {
    if (!records[i]) continue
    // Only the first two tabs are separators; filenames can contain tabs/newlines.
    const match = /^(\d+|-)\t(\d+|-)\t([\s\S]*)$/.exec(records[i])
    if (!match) throw new Error('Unexpected Git numstat output')
    if (match[1] !== '-') summary.insertions += Number(match[1])
    if (match[2] !== '-') summary.deletions += Number(match[2])
    if (match[3] === '') i += 2 // Rename: old and new paths follow as NUL records.
  }
}

export async function collectChanges(git: GitRunner, root: string): Promise<ChangeSummary> {
  const status = await git.run(['-c', 'status.renames=true', 'status', '--porcelain=v1', '-z', '--untracked-files=all'])
  const paths = new Set<string>()
  const untracked: string[] = []
  const records = status.split('\0')
  for (let i = 0; i < records.length; i++) {
    const record = records[i]
    if (!record) continue
    const code = record.slice(0, 2)
    const path = record.slice(3)
    paths.add(path)
    if (code === '??') untracked.push(path)
    if (/[RC]/.test(code)) i++
  }
  const summary = { files: paths.size, insertions: 0, deletions: 0 }
  if (!summary.files) return summary

  const head = (await git.run(['rev-parse', '--verify', '--quiet', 'HEAD'], [1])).trim()
  // Git recognizes the empty tree even before the first commit; compute its ID
  // rather than assuming SHA-1. hash-object without -w does not write anything.
  const base = head || (await git.run(['hash-object', '-t', 'tree', '--stdin'])).trim()
  addNumstat(summary, await git.run([
    'diff', '--no-ext-diff', '--no-textconv', '--numstat', '-z', '--find-renames', base, '--'
  ]))
  for (const path of untracked) {
    addNumstat(summary, await git.run([
      'diff', '--no-index', '--no-ext-diff', '--no-textconv', '--numstat', '-z', '--',
      process.platform === 'win32' ? 'NUL' : '/dev/null', join(root, path)
    ], [1]))
  }
  return summary
}
