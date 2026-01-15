import * as vscode from 'vscode';
import { ErrorReporter } from './errorReporter';
import { WebviewManager } from './webviewManager';
import { ParameterCache } from './parameterCache';
import { resolveJscadEntrypoint } from './jscadEngine';
import { extractFilename } from './utilities';
import { executeExportCommand } from './exportCommand';
import { McpManager } from './mcpManager';
import { HootcadMcpServerDefinitionProvider } from './mcpDefinitionProvider';

/**
 * Manages extension lifecycle, commands, and file watchers
 */
export class ExtensionLifecycle {
	private context: vscode.ExtensionContext;
	private errorReporter: ErrorReporter;
	private webviewManager: WebviewManager;
	private mcpManager: McpManager;
	private mcpDefinitionProvider: HootcadMcpServerDefinitionProvider | undefined;
	private statusBarItem: vscode.StatusBarItem;
	private outputChannel: vscode.OutputChannel;

	constructor(context: vscode.ExtensionContext) {
		this.context = context;

		// Create output channel
		this.outputChannel = vscode.window.createOutputChannel("HootCAD");
		context.subscriptions.push(this.outputChannel);
		this.outputChannel.appendLine('HootCAD extension activated');

		// Initialize error reporter
		this.errorReporter = new ErrorReporter(this.outputChannel);

		// Initialize parameter cache
		const parameterCache = new ParameterCache(context);

		// Create status bar item
		this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
		this.statusBarItem.text = "HootCAD: Ready";
		context.subscriptions.push(this.statusBarItem);
		this.statusBarItem.show();

		// Initialize webview manager
		this.webviewManager = new WebviewManager(context, this.errorReporter, parameterCache, this.statusBarItem);
		
		// Initialize MCP manager
		this.mcpManager = new McpManager(context, this.outputChannel);
		context.subscriptions.push(this.mcpManager);

		// Register MCP server definition provider (if supported by this VS Code version)
		this.registerMcpServerDefinitionProvider();
	}

	private registerMcpServerDefinitionProvider(): void {
		const lm: any = (vscode as any).lm;
		if (!lm || typeof lm.registerMcpServerDefinitionProvider !== 'function') {
			this.outputChannel.appendLine('MCP server definition provider API not available in this VS Code version');
			return;
		}

		this.mcpDefinitionProvider = new HootcadMcpServerDefinitionProvider(this.context);
		const disposable = lm.registerMcpServerDefinitionProvider('hootcad.mcp-servers', this.mcpDefinitionProvider);
		this.context.subscriptions.push(disposable);
		this.outputChannel.appendLine('Registered MCP server definition provider: hootcad.mcp-servers');
	}

	/**
	 * Activate the extension and register all commands and watchers
	 */
	activate(): void {
		this.registerCommands();
		this.registerFileWatchers();
		this.registerEditorWatchers();

		// If the user already opted in previously, start MCP automatically.
		void this.mcpManager.startIfEnabled();
	}

	/**
	 * Register extension commands
	 */
	private registerCommands(): void {
		const openPreviewCommand = vscode.commands.registerCommand('hootcad.openPreview', async () => {
			this.errorReporter.logInfo('Opening HootCAD preview...');
			await this.webviewManager.createOrShowPreview();
			
			// Show MCP enablement prompt on first preview
			await this.mcpManager.showEnablementPrompt();
		});
		this.context.subscriptions.push(openPreviewCommand);

		const exportCommand = vscode.commands.registerCommand('hootcad.export', async () => {
			this.errorReporter.logInfo('Executing export command...');
			await executeExportCommand(this.errorReporter, this.outputChannel);
		});
		this.context.subscriptions.push(exportCommand);
		
		const enableMcpCommand = vscode.commands.registerCommand('hootcad.enableMcp', async () => {
			this.errorReporter.logInfo('Enabling MCP Validation Server...');
			await this.mcpManager.enableMcpServer();
			this.mcpDefinitionProvider?.refresh();
		});
		this.context.subscriptions.push(enableMcpCommand);
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
