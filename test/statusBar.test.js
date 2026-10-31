const { test } = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const gitChanges = require('../out/gitChanges')

function event() {
  const listeners = new Set()
  const subscribe = listener => {
    listeners.add(listener)
    return { dispose: () => listeners.delete(listener) }
  }
  subscribe.fire = value => [...listeners].forEach(listener => listener(value))
  subscribe.size = () => listeners.size
  return subscribe
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

test('status bar selection, refresh, settings, failures, cancellation and disposal', async () => {
  const config = { enabled: true, priority: 1 }
  const editorChanged = event(), configurationChanged = event(), enablementChanged = event()
  const opened = event(), closed = event()
  const repo = name => ({ rootUri: { fsPath: name, scheme: 'file' }, state: { onDidChange: event() }, ui: { selected: false, onDidChange: event() } })
  const first = repo('/first'), second = repo('/second')
  const api = {
    repositories: [first, second], git: { path: 'git' },
    getRepository: uri => api.repositories.find(repository => repository.rootUri.fsPath === uri.fsPath),
    onDidOpenRepository: opened, onDidCloseRepository: closed
  }
  const git = { enabled: true, getAPI: () => api, onDidChangeEnablement: enablementChanged }
  const items = [], logs = [], calls = [], runners = []
  let result = async () => ({ files: 1, insertions: 34, deletions: 73 })
  gitChanges.collectChanges = async (runner, root) => { calls.push(root); return result() }
  gitChanges.GitRunner = class {
    constructor() { runners.push(this) }
    dispose() { this.disposed = true }
  }
  const vscode = {
    StatusBarAlignment: { Right: 2 },
    window: {
      onDidChangeActiveTextEditor: editorChanged,
      createOutputChannel: name => {
        assert.equal(name, 'Diff Stats')
        return { appendLine: line => logs.push(line), dispose() {} }
      },
      createStatusBarItem: (alignment, priority) => {
        const item = { alignment, priority, visible: false, show() { this.visible = true }, hide() { this.visible = false }, dispose() { this.disposed = true; this.visible = false } }
        items.push(item)
        return item
      }
    },
    workspace: { getConfiguration: section => {
      assert.equal(section, 'diffStats')
      return { get: (key, fallback) => config[key] ?? fallback }
    }, onDidChangeConfiguration: configurationChanged },
    extensions: { getExtension: () => ({ activate: async () => git }) }
  }
  const originalLoad = Module._load
  Module._load = function(name, ...args) { return name === 'vscode' ? vscode : originalLoad.call(this, name, ...args) }
  let ChangesStatusBar
  try { ChangesStatusBar = require('../out/ChangesStatusBar').default } finally { Module._load = originalLoad }
  const controller = new ChangesStatusBar()
  try {
    await delay(260)
    assert.equal(items[0].text, '1 File +34 −73')
    assert.equal(items[0].command, 'workbench.view.scm')
    assert.equal(items[0].priority, 1)
    assert.equal(calls.at(-1), '/first')
    assert.match(items[0].tooltip, /\/first/)

    second.ui.selected = true
    second.ui.onDidChange.fire()
    await delay(230)
    assert.equal(calls.at(-1), '/second')
    vscode.window.activeTextEditor = { document: { uri: first.rootUri } }
    editorChanged.fire()
    await delay(230)
    assert.equal(calls.at(-1), '/first')

    result = async () => ({ files: 0, insertions: 0, deletions: 0 })
    first.state.onDidChange.fire()
    first.state.onDidChange.fire()
    const previousCalls = calls.length
    await delay(230)
    assert.equal(calls.length, previousCalls + 1)
    assert.equal(items[0].text, 'No changes')

    result = async () => { throw new Error('Git failed') }
    first.state.onDidChange.fire()
    await delay(230)
    assert.equal(items[0].visible, false)
    assert.match(logs.at(-1), /Git failed/)

    let finish
    result = () => new Promise(resolve => { finish = resolve })
    first.state.onDidChange.fire()
    await delay(230)
    const pending = runners.at(-1)
    config.enabled = false
    configurationChanged.fire({ affectsConfiguration: section => section === 'diffStats' })
    assert.equal(pending.disposed, true)
    finish({ files: 9, insertions: 9, deletions: 9 })
    await delay(10)
    assert.equal(items[0].visible, false)

    config.enabled = true
    config.priority = 5
    result = async () => ({ files: 2, insertions: 2, deletions: 0 })
    configurationChanged.fire({ affectsConfiguration: section => section === 'diffStats' })
    await delay(230)
    assert.equal(items[1].priority, 5)
    assert.equal(items[1].text, '2 Files +2 −0')
    git.enabled = false
    enablementChanged.fire(false)
    assert.equal(items[1].visible, false)
    assert.equal(first.state.onDidChange.size(), 0)
    git.enabled = true
    enablementChanged.fire(true)
    await delay(230)
    assert.equal(items[1].visible, true)

    api.repositories = []
    closed.fire(first)
    closed.fire(second)
    await delay(230)
    assert.equal(items[1].visible, false)
    assert.equal(second.ui.onDidChange.size(), 0)
    api.repositories = [second]
    opened.fire(second)
    await delay(230)
    assert.equal(items[1].visible, true)
    assert.equal(calls.at(-1), '/second')

    second.state.onDidChange.fire()
    controller.dispose()
    const beforeDisposal = calls.length
    await delay(230)
    assert.equal(calls.length, beforeDisposal)
    assert.equal(items[1].visible, false)
    for (const source of [editorChanged, configurationChanged, enablementChanged, opened, closed, second.state.onDidChange, second.ui.onDidChange]) assert.equal(source.size(), 0)
  } finally { controller.dispose() }
})
