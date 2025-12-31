import * as vscode from 'vscode';
import { ExtensionLifecycle } from './extensionLifecycle';

/**
 * Extension activation entry point
 */
export function activate(context: vscode.ExtensionContext) {
const lifecycle = new ExtensionLifecycle(context);
lifecycle.activate();
}

export function deactivate() {
// Cleanup is handled by VS Code disposing subscriptions
}
