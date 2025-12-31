import * as vscode from 'vscode';
import { ErrorReporter } from './errorReporter';
import { WebviewManager } from './webviewManager';
import { ParameterCache } from './parameterCache';
import { resolveJscadEntrypoint } from './jscadEngine';
import { extractFilename } from './utilities';

/**
 * Manages extension lifecycle, commands, and file watchers
 */
export class ExtensionLifecycle {
	private context: vscode.ExtensionContext;
	private errorReporter: ErrorReporter;
	private webviewManager: WebviewManager;
	private statusBarItem: vscode.StatusBarItem;

	constructor(context: vscode.ExtensionContext) {
		this.context = context;

		// Create output channel
		const outputChannel = vscode.window.createOutputChannel("HootCAD");
		context.subscriptions.push(outputChannel);
		outputChannel.appendLine('HootCAD extension activated');

		// Initialize error reporter
		this.errorReporter = new ErrorReporter(outputChannel);

		// Initialize parameter cache
		const parameterCache = new ParameterCache(context);

		// Create status bar item
		this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
		this.statusBarItem.text = "HootCAD: Ready";
		context.subscriptions.push(this.statusBarItem);
		this.statusBarItem.show();

		// Initialize webview manager
		this.webviewManager = new WebviewManager(context, this.errorReporter, parameterCache, this.statusBarItem);
	}

	/**
	 * Activate the extension and register all commands and watchers
	 */
	activate(): void {
		this.registerCommands();
		this.registerFileWatchers();
		this.registerEditorWatchers();
	}

	/**
	 * Register extension commands
	 */
	private registerCommands(): void {
		const openPreviewCommand = vscode.commands.registerCommand('hootcad.openPreview', async () => {
			this.errorReporter.logInfo('Opening HootCAD preview...');
			await this.webviewManager.createOrShowPreview();
		});
		this.context.subscriptions.push(openPreviewCommand);
	}

	/**
	 * Register file save watchers
	 */
	private registerFileWatchers(): void {
		const saveWatcher = vscode.workspace.onDidSaveTextDocument(async (document) => {
			if (document.fileName.endsWith('.jscad')) {
				const fileName = extractFilename(document.fileName);
				this.errorReporter.logInfo(`File saved: ${fileName}`);
				this.statusBarItem.text = `HootCAD: Saved ${fileName}`;

				// Re-execute and re-render if panel is open
				if (this.webviewManager.isPanelOpen()) {
					const entrypoint = resolveJscadEntrypoint();
					if (entrypoint) {
						await this.webviewManager.executeAndRender(entrypoint.filePath);
					}
				}

				// Reset status after 3 seconds
				setTimeout(() => {
					this.statusBarItem.text = "HootCAD: Ready";
				}, 3000);
			}
		});
		this.context.subscriptions.push(saveWatcher);
	}

	/**
	 * Register active editor watchers
	 */
	private registerEditorWatchers(): void {
		const editorWatcher = vscode.window.onDidChangeActiveTextEditor((editor) => {
			if (editor && editor.document.fileName.endsWith('.jscad')) {
				const fileName = extractFilename(editor.document.fileName);
				this.errorReporter.logInfo(`Active file: ${fileName}`);
				this.statusBarItem.text = `HootCAD: ${fileName}`;
			}
		});
		this.context.subscriptions.push(editorWatcher);
	}
}
