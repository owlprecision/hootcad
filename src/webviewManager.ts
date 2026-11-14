import * as vscode from 'vscode';
import { ErrorReporter } from './errorReporter';
import { WebviewContentProvider } from './webviewContentProvider';
import { ParameterCache } from './parameterCache';
import { resolveJscadEntrypoint, executeJscadFile, getParameterDefinitions } from './jscadEngine';
import { extractFilename, formatPreviewTitle } from './utilities';

/**
 * The format hand-off that travels with a reference model's bytes: the
 * load format named from the picked file's extension, an OBJ material
 * file's bytes and name when the extension host found one beside the OBJ,
 * and the name of a declared material file that was not found — in that
 * case the model still loads, without materials, and the preview says so.
 */
export interface ReferenceModelOptions {
	format?: string;
	mtlData?: Uint8Array;
	mtlName?: string;
	missingMaterial?: string;
}

/**
 * Manages webview panel lifecycle, messaging, and rendering
 */
export class WebviewManager {
	private currentPanel: vscode.WebviewPanel | undefined;
	private currentEntrypoint: string | undefined;
	private webviewReady = false;
	private pendingReferenceModel: ({ name: string; data: Uint8Array } & ReferenceModelOptions) | undefined;
	private context: vscode.ExtensionContext;
	private errorReporter: ErrorReporter;
	private contentProvider: WebviewContentProvider;
	private parameterCache: ParameterCache;
	private statusBarItem: vscode.StatusBarItem;

	constructor(
		context: vscode.ExtensionContext,
		errorReporter: ErrorReporter,
		parameterCache: ParameterCache,
		statusBarItem: vscode.StatusBarItem
	) {
		this.context = context;
		this.errorReporter = errorReporter;
		this.parameterCache = parameterCache;
		this.statusBarItem = statusBarItem;
		this.contentProvider = new WebviewContentProvider(context);
	}

	/**
	 * Create or show the preview panel
	 */
	async createOrShowPreview(): Promise<void> {
		// Resolve JSCAD entrypoint
		const entrypoint = resolveJscadEntrypoint();

		if (!entrypoint) {
			const errorMsg = 'No JSCAD entrypoint found. Open a .jscad file or define one in package.json.';
			this.errorReporter.logInfo(`Error: ${errorMsg}`);
			vscode.window.showErrorMessage(errorMsg);
			return;
		}

		this.errorReporter.logInfo(`Resolved entrypoint: ${entrypoint.filePath} (source: ${entrypoint.source})`);

		// Store the entrypoint
		this.currentEntrypoint = entrypoint.filePath;

		// Format the preview window title
		const title = formatPreviewTitle(entrypoint.filePath);

		// If panel already exists, reveal it
		if (this.currentPanel) {
			this.currentPanel.title = title;
			this.currentPanel.reveal(vscode.ViewColumn.Two);
			// Re-execute and render
			await this.executeAndRender(entrypoint.filePath);
			return;
		}

		// Create new webview panel
		this.webviewReady = false;
		this.currentPanel = vscode.window.createWebviewPanel(
			'hootcadPreview',
			title,
			vscode.ViewColumn.Two,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [
					vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview')
				]
			}
		);

		// Set HTML content
		this.currentPanel.webview.html = this.contentProvider.getWebviewContent(this.currentPanel.webview);

		// Handle messages from webview
		this.currentPanel.webview.onDidReceiveMessage(
			async message => {
				await this.handleWebviewMessage(message);
			},
			undefined,
			this.context.subscriptions
		);

		// Reset panel when disposed
		this.currentPanel.onDidDispose(
			() => {
				this.currentPanel = undefined;
				this.currentEntrypoint = undefined;
				this.webviewReady = false;
				this.pendingReferenceModel = undefined;
				this.errorReporter.logInfo('Preview panel closed');
			},
			null,
			this.context.subscriptions
		);

		this.errorReporter.logInfo('Preview panel created');
	}

	/**
	 * Handle messages from the webview
	 */
	private async handleWebviewMessage(message: any): Promise<void> {
		switch (message.type) {
			case 'info':
				this.errorReporter.logInfo(`Webview message: ${message.text}`);
				vscode.window.showInformationMessage(message.text);
				return;
			case 'ready':
				this.webviewReady = true;
				this.errorReporter.logInfo('Webview is ready');
				// Execute and render the stored entrypoint
				if (this.currentEntrypoint) {
					this.errorReporter.logInfo(`Executing from ready handler: ${this.currentEntrypoint}`);
					await this.executeAndRender(this.currentEntrypoint);
				} else {
					this.errorReporter.logInfo('No entrypoint stored in ready handler');
				}
				// A reference model picked while the panel was still opening
				// is delivered once the first render is on its way.
				if (this.pendingReferenceModel && this.currentPanel) {
					const pending = this.pendingReferenceModel;
					this.pendingReferenceModel = undefined;
					void this.currentPanel.webview.postMessage(this.referenceModelMessage(pending));
				}
				return;
			case 'referenceModelLoaded': {
				const notes: string[] = [];
				if (message.materialFile) {
					notes.push(`materials from ${message.materialFile}`);
				}
				if (message.materialsMissing) {
					notes.push(`material file ${message.materialsMissing} not found - loaded without materials`);
				}
				this.errorReporter.logInfo(
					`Reference model in preview: ${message.name} (${message.format}, ${message.meshCount} meshes${notes.length > 0 ? '; ' + notes.join('; ') : ''})`
				);
				this.statusBarItem.text = `HootCAD: Reference ${message.name}`;
				setTimeout(() => {
					this.statusBarItem.text = "HootCAD: Ready";
				}, 3000);
				return;
			}
			case 'referenceModelError':
				this.errorReporter.logInfo(`Reference model error: ${message.message}`);
				vscode.window.showErrorMessage(message.message);
				return;
			case 'referenceModelCleared':
				this.errorReporter.logInfo('Reference model cleared from preview');
				return;
			case 'parameterChanged':
				this.errorReporter.logInfo(`Parameter changed: ${message.name} = ${message.value}`);
				// Update cache
				this.parameterCache.updateParameter(message.filePath, message.name, message.value);
				// Re-render with new parameters
				await this.executeAndRender(message.filePath);
				return;
			case 'saveSnapshot': {
				// The webview sends the framed preview canvas as a PNG data URL;
				// the host owns the save dialog and the file write.
				const match = typeof message.dataUrl === 'string'
					? /^data:image\/png;base64,(.+)$/.exec(message.dataUrl)
					: null;
				if (!match) {
					this.errorReporter.logInfo('Snapshot ignored: webview sent no PNG data');
					return;
				}
				const target = await vscode.window.showSaveDialog({
					defaultUri: vscode.Uri.file('hootcad-snapshot.png'),
					filters: { 'PNG Image': ['png'] }
				});
				if (!target) {
					return;
				}
				await vscode.workspace.fs.writeFile(target, Buffer.from(match[1], 'base64'));
				this.errorReporter.logInfo(`Saved preview snapshot: ${target.fsPath}`);
				return;
			}
		}
	}

	/**
	 * Execute JSCAD file and render in webview
	 */
	async executeAndRender(filePath: string): Promise<void> {
		let lastParams: Record<string, any> | undefined;
		try {
			const isFileChange = this.currentEntrypoint !== filePath;
			this.currentEntrypoint = filePath;
			if (this.currentPanel) {
				this.currentPanel.title = formatPreviewTitle(filePath);
			}

			this.errorReporter.logInfo(`Executing JSCAD file: ${filePath}`);
			this.statusBarItem.text = "HootCAD: Executing...";

			// Get parameter definitions
			const definitions = await getParameterDefinitions(filePath, this.errorReporter.getOutputChannel());

			// Get merged parameters (defaults + cached values)
			const params = this.parameterCache.getMergedParameters(filePath, definitions);
			lastParams = params;

			// Execute with parameters
			const entities = await executeJscadFile(filePath, this.errorReporter.getOutputChannel(), params);

			if (this.currentPanel) {
				if (isFileChange) {
					this.currentPanel.webview.postMessage({ type: 'resetView' });
				}
				// Send both entities and parameter UI data to webview
				this.currentPanel.webview.postMessage({
					type: 'renderEntities',
					entities: entities,
					parameters: {
						definitions: definitions,
						values: params,
						filePath: filePath
					}
				});
				this.errorReporter.logInfo('Render entities sent to webview');
				this.statusBarItem.text = "HootCAD: Rendered";

				// Reset status after 3 seconds
				setTimeout(() => {
					this.statusBarItem.text = "HootCAD: Ready";
				}, 3000);
			}
		} catch (error) {
			this.errorReporter.reportExecutionError(error, filePath, lastParams);
			this.statusBarItem.text = "HootCAD: Error";

			if (this.currentPanel) {
				this.currentPanel.webview.postMessage({
					type: 'error',
					message: this.errorReporter.getErrorMessage(error)
				});
			}
		}
	}

	/**
	 * Check if preview panel is currently open
	 */
	isPanelOpen(): boolean {
		return this.currentPanel !== undefined;
	}

	/**
	 * The webview message that carries a reference model load: the file's
	 * bytes plus the format hand-off (see ReferenceModelOptions).
	 */
	private referenceModelMessage(load: { name: string; data: Uint8Array } & ReferenceModelOptions) {
		return {
			type: 'loadReferenceModel',
			name: load.name,
			data: load.data,
			format: load.format,
			mtlData: load.mtlData,
			mtlName: load.mtlName,
			missingMaterial: load.missingMaterial
		};
	}

	/**
	 * Send a reference model file's bytes to the preview webview. When the
	 * panel was just created and its webview has not signalled ready yet, the
	 * model is queued and delivered by the ready handler instead.
	 */
	sendReferenceModel(name: string, data: Uint8Array, options: ReferenceModelOptions = {}): void {
		if (!this.currentPanel) {
			return;
		}
		const load = { name, data, ...options };
		if (this.webviewReady) {
			void this.currentPanel.webview.postMessage(this.referenceModelMessage(load));
		} else {
			this.pendingReferenceModel = load;
		}
	}

	/**
	 * Ask the preview webview to remove its reference model
	 */
	clearReferenceModel(): void {
		this.pendingReferenceModel = undefined;
		if (this.currentPanel) {
			void this.currentPanel.webview.postMessage({ type: 'clearReferenceModel' });
		}
	}
}
