import * as vscode from 'vscode';
import * as path from 'path';

const CONFIG_KEY_ENABLED = 'hootcad.mcp.enabled';

export class HootcadMcpServerDefinitionProvider implements vscode.McpServerDefinitionProvider {
	private readonly context: vscode.ExtensionContext;
	private readonly _onDidChange = new vscode.EventEmitter<void>();

	readonly onDidChangeMcpServerDefinitions = this._onDidChange.event;

	constructor(context: vscode.ExtensionContext) {
		this.context = context;
	}

	refresh(): void {
		this._onDidChange.fire();
	}

	provideMcpServerDefinitions(_token: vscode.CancellationToken): vscode.ProviderResult<vscode.McpServerDefinition[]> {
		const enabled = this.context.globalState.get<boolean>(CONFIG_KEY_ENABLED, false);
		if (!enabled) {
			return [];
		}

		const mcpServerPath = path.join(this.context.extensionPath, 'dist', 'mcpServer.js');

		// Prefer the extension host's Node runtime for reliability.
		// This avoids requiring a separate system Node installation.
		const command = process.execPath;
		const args = [mcpServerPath];

		return [
			new vscode.McpStdioServerDefinition(
				'HootCAD Validation (math.eval)',
				command,
				args,
				{},
				'0.1.0'
			)
		];
	}
}
