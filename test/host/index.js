const assert = require('assert').strict
const fs = require('fs')
const path = require('path')
const vscode = require('vscode')
const ChangesStatusBar = require('../../out/ChangesStatusBar').default

async function until(predicate, label) {
  const deadline = Date.now() + 15000
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`Timed out: ${label}`)
    await new Promise(resolve => setTimeout(resolve, 50))
  }
}

exports.run = async () => {
  const extension = vscode.extensions.getExtension('yay.diff-stats')
  assert(extension, 'Extension is discovered')
  await extension.activate()
  const git = await vscode.extensions.getExtension('vscode.git').activate()
  const api = git.getAPI(1)
  await until(() => api.repositories.length > 0, 'Git repository discovery')
  const repository = api.repositories[0]
  const summary = new ChangesStatusBar()
  const config = vscode.workspace.getConfiguration('diffStats')
  const previousEnabled = config.inspect('enabled').globalValue
  const previousPriority = config.inspect('priority').globalValue
  try {
    await until(() => summary.item && summary.item.text === 'No changes', 'clean summary')
    const file = path.join(repository.rootUri.fsPath, 'file.txt')
    fs.writeFileSync(file, 'one\nchanged\nextra\n')
    await repository.status()
    await until(() => summary.item.text === '1 File +2 −1', 'saved changes refresh')
    await repository.add([file])
    await repository.status()
    await until(() => summary.item.text === '1 File +2 −1', 'staged changes')
    await vscode.commands.executeCommand(summary.item.command)
    assert(summary.item.tooltip.includes(repository.rootUri.fsPath))
    const commands = await vscode.commands.getCommands(true)
    for (const command of ['lntoggle.hide', 'lntoggle.toggle', 'lntoggle.show']) {
      assert(!commands.includes(command), `Removed command must not be registered: ${command}`)
    }
    assert(!extension.packageJSON.contributes.commands)
    assert(!extension.packageJSON.contributes.keybindings)
    assert.equal(config.get('enabled'), true)
    assert.equal(config.get('priority'), 1)
    await config.update('enabled', false, true)
    await until(() => !summary.item, 'disable summary')
    await config.update('priority', 5, true)
    await config.update('enabled', true, true)
    await until(() => summary.item && summary.item.text === '1 File +2 −1', 're-enable summary')
    assert.equal(summary.item.priority, 5)
    fs.writeFileSync(path.join(repository.rootUri.fsPath, '..', 'host-result'), 'passed')
    console.log('HOST TEST PASSED: activation, real Git events, clean/dirty counts, Source Control navigation, renamed settings and absence of toggle commands')
  } finally {
    summary.dispose()
    await config.update('enabled', previousEnabled, true)
    await config.update('priority', previousPriority, true)
  }
}
