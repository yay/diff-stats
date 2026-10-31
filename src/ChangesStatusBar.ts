import * as vscode from 'vscode'
import { collectChanges, GitRunner } from './gitChanges'

// The small subset of the built-in vscode.git API v1 used by this extension.
interface Repository {
  rootUri: vscode.Uri
  state: { onDidChange: vscode.Event<void> }
  ui: { selected: boolean; onDidChange: vscode.Event<void> }
}
interface GitAPI {
  git: { path: string }
  repositories: Repository[]
  getRepository(uri: vscode.Uri): Repository | null
  onDidOpenRepository: vscode.Event<Repository>
  onDidCloseRepository: vscode.Event<Repository>
}
interface GitExtension {
  enabled: boolean
  onDidChangeEnablement: vscode.Event<boolean>
  getAPI(version: 1): GitAPI
}

export default class ChangesStatusBar implements vscode.Disposable {
  private item?: vscode.StatusBarItem
  private output = vscode.window.createOutputChannel('Diff Stats')
  private subscriptions: vscode.Disposable[] = []
  private gitSubscriptions: vscode.Disposable[] = []
  private repositorySubscriptions = new Map<Repository, vscode.Disposable[]>()
  private api?: GitAPI
  private timer?: NodeJS.Timeout
  private runner?: GitRunner
  private generation = 0
  private disposed = false

  constructor() {
    this.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(() => this.schedule()),
      vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('diffStats')) this.configure()
      })
    )
    this.configure()
    this.connect().catch(error => this.log(error))
  }

  private configure() {
    this.item?.dispose()
    this.item = undefined
    const config = vscode.workspace.getConfiguration('diffStats')
    if (config.get('enabled', true)) {
      this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, config.get('priority', 1))
      this.item.command = 'workbench.view.scm'
    }
    this.schedule()
  }

  private async connect() {
    const extension = vscode.extensions.getExtension<GitExtension>('vscode.git')
    if (!extension) return
    const git = await extension.activate()
    if (this.disposed) return
    this.subscriptions.push(git.onDidChangeEnablement(() => this.attach(git)))
    this.attach(git)
  }

  private attach(git: GitExtension) {
    this.gitSubscriptions.forEach(subscription => subscription.dispose())
    this.gitSubscriptions = []
    this.repositorySubscriptions.forEach(subscriptions => subscriptions.forEach(subscription => subscription.dispose()))
    this.repositorySubscriptions.clear()
    this.api = git.enabled ? git.getAPI(1) : undefined
    if (this.api) {
      this.api.repositories.forEach(repository => this.watch(repository))
      this.gitSubscriptions.push(
        this.api.onDidOpenRepository(repository => { this.watch(repository); this.schedule() }),
        this.api.onDidCloseRepository(repository => {
          this.repositorySubscriptions.get(repository)?.forEach(subscription => subscription.dispose())
          this.repositorySubscriptions.delete(repository)
          this.schedule()
        })
      )
    }
    this.schedule()
  }

  private watch(repository: Repository) {
    if (this.repositorySubscriptions.has(repository)) return
    this.repositorySubscriptions.set(repository, [
      repository.state.onDidChange(() => this.schedule()),
      repository.ui.onDidChange(() => this.schedule())
    ])
  }

  private schedule() {
    if (this.disposed) return
    this.generation++
    if (this.timer) clearTimeout(this.timer)
    this.runner?.dispose()
    this.runner = undefined
    // Do not show counts for a previously selected repository while refreshing.
    this.item?.hide()
    if (!this.item || !this.api) return
    this.timer = setTimeout(() => { this.timer = undefined; void this.refresh() }, 200)
  }

  private async refresh() {
    const api = this.api
    const item = this.item
    if (!api || !item || this.disposed) return
    const editor = vscode.window.activeTextEditor
    const repository = (editor && api.getRepository(editor.document.uri)) ||
      api.repositories.find(candidate => candidate.ui.selected) || api.repositories[0]
    if (!repository || repository.rootUri.scheme !== 'file') return
    const generation = this.generation
    const runner = new GitRunner(api.git.path, repository.rootUri.fsPath)
    this.runner = runner
    try {
      const summary = await collectChanges(runner, repository.rootUri.fsPath)
      if (this.disposed || generation !== this.generation) return
      item.text = summary.files === 0 ? 'No changes' :
        `${summary.files} ${summary.files === 1 ? 'File' : 'Files'} +${summary.insertions} −${summary.deletions}`
      item.tooltip = `${repository.rootUri.fsPath}\nView uncommitted changes in Source Control\nSaved staged, unstaged, and untracked files. Line counts are net changes against HEAD; binary files count only as files.`
      item.show()
    } catch (error) {
      if (!this.disposed && generation === this.generation) {
        item.hide()
        this.log(error)
      }
    } finally {
      runner.dispose()
      if (this.runner === runner) this.runner = undefined
    }
  }

  private log(error: unknown) {
    if (!this.disposed) this.output.appendLine(String(error))
  }

  dispose() {
    this.disposed = true
    this.generation++
    if (this.timer) clearTimeout(this.timer)
    this.runner?.dispose()
    this.subscriptions.concat(this.gitSubscriptions).forEach(subscription => subscription.dispose())
    this.repositorySubscriptions.forEach(subscriptions => subscriptions.forEach(subscription => subscription.dispose()))
    this.item?.dispose()
    this.output.dispose()
  }
}
