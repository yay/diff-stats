import * as vscode from 'vscode'
import ChangesStatusBar from './ChangesStatusBar'

export function activate (context: vscode.ExtensionContext) {
	context.subscriptions.push(new ChangesStatusBar())
}
